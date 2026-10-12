import type { AttemptResultV1, NodeResultV1, ProducedOutputV1, ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { AttemptExecution, NodeExecution, TestPlanRunResult, TestPlanRunnerOptions } from './runner-types.ts';
import { compareText, finalNodeResult, freeze, terminalResult } from './runner-values.ts';

interface SchedulerOwner {
  readonly options: TestPlanRunnerOptions;
  readonly authorityId: string;
  readonly id: () => string;
  readonly cleanupErrors: readonly { nodeId: string; message: string }[];
  executeNode(node: ResolvedPlanNodeV1, outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>): Promise<NodeExecution>;
  retainFixture(node: ResolvedPlanNodeV1, execution: AttemptExecution): void;
  cleanupFixtures(): Promise<void>;
}

/** One invocation owns scheduling state; attempt and fixture ownership stays in Runner. */
export class RunnerScheduler {
  readonly #owner: SchedulerOwner;
  readonly #attempts: AttemptResultV1[] = [];
  readonly #results = new Map<string, NodeResultV1>();
  readonly #outputs = new Map<string, readonly ProducedOutputV1[]>();
  readonly #running = new Map<string, Promise<NodeExecution>>();
  readonly #groupUse = new Map<string, number>();
  readonly #pending: Map<string, ResolvedPlanNodeV1>;

  constructor(owner: SchedulerOwner) {
    this.#owner = owner;
    this.#pending = new Map(owner.options.plan.nodes.map(node => [node.id, node]));
  }

  async run(): Promise<TestPlanRunResult> {
    const failures: unknown[] = [];
    try {
      while (this.#pending.size > 0 || this.#running.size > 0) {
        let progressed = this.#schedulePending();
        if (this.#running.size > 0) {
          await this.#completeNext();
          progressed = true;
        }
        if (!progressed) throw new Error('TEST_RUNNER_DEADLOCK');
      }
    } catch (error) {
      failures.push(error);
      await this.#settleRunning(failures);
    } finally {
      try { await this.#owner.cleanupFixtures(); }
      catch (error) { addFailure(failures, error); }
    }
    throwFailures(failures);
    this.#applyCleanupFailures();
    return freeze({
      planId: this.#owner.options.plan.planId,
      runId: this.#owner.options.plan.runId,
      attempts: this.#attempts.sort((a, b) => compareText(a.attemptId, b.attemptId)),
      nodes: [...this.#results.values()].sort((a, b) => compareText(a.nodeId, b.nodeId)),
      cleanupErrors: [...this.#owner.cleanupErrors],
    });
  }

  #schedulePending(): boolean {
    let progressed = false;
    for (const node of [...this.#pending.values()].sort((a, b) => compareText(a.id, b.id))) {
      if (this.#schedule(node)) progressed = true;
    }
    return progressed;
  }

  #finishWithoutAttempt(node: ResolvedPlanNodeV1, cancelled: boolean, reason: string | null): void {
    this.#results.set(node.id, finalNodeResult(
      this.#owner.options.plan, node, [],
      cancelled ? 'cancelled' : 'skipped', cancelled ? null : 'skipped', reason,
      { authorityId: this.#owner.authorityId, nonce: this.#owner.id() },
    ));
    this.#pending.delete(node.id);
  }

  #schedule(node: ResolvedPlanNodeV1): boolean {
    if (node.skipReason !== null) {
      this.#finishWithoutAttempt(node, false, node.skipReason);
      return true;
    }
    if (this.#owner.options.signal?.aborted) {
      this.#finishWithoutAttempt(node, true, null);
      return true;
    }
    if (!node.dependencies.every(dependency => this.#results.has(dependency.nodeId))) return false;
    const rejected = node.dependencies.find(dependency =>
      !dependency.acceptedResults.includes(terminalResult(this.#results.get(dependency.nodeId)!) as never));
    if (rejected) {
      this.#finishWithoutAttempt(node, false,
        `dependency ${rejected.nodeId} returned ${terminalResult(this.#results.get(rejected.nodeId)!)}`);
      return true;
    }
    if (this.#running.size >= this.#owner.options.maximumConcurrency) return false;
    if (!this.#reserveGroup(node)) return false;
    this.#pending.delete(node.id);
    const task = this.#owner.executeNode(node, this.#outputs).finally(() => {
      if (node.concurrencyGroup !== null) this.#groupUse.set(
        node.concurrencyGroup, (this.#groupUse.get(node.concurrencyGroup) ?? 1) - 1);
    });
    this.#running.set(node.id, task);
    return true;
  }

  #reserveGroup(node: ResolvedPlanNodeV1): boolean {
    if (node.concurrencyGroup === null) return true;
    const limit = this.#owner.options.plan.concurrencyLimits[node.concurrencyGroup];
    if (limit === undefined) throw new Error(`TEST_RUNNER_CONCURRENCY_GROUP_MISSING:${node.concurrencyGroup}`);
    if ((this.#groupUse.get(node.concurrencyGroup) ?? 0) >= limit) return false;
    this.#groupUse.set(node.concurrencyGroup, (this.#groupUse.get(node.concurrencyGroup) ?? 0) + 1);
    return true;
  }

  async #completeNext(): Promise<void> {
    const completed = await Promise.race([...this.#running.entries()].map(async ([id, task]) => ({
      id, execution: await task,
    })));
    this.#running.delete(completed.id);
    this.#recordExecution(completed.id, completed.execution);
  }

  async #settleRunning(failures: unknown[]): Promise<void> {
    const entries = [...this.#running.entries()];
    const settled = await Promise.allSettled(entries.map(([, task]) => task));
    this.#running.clear();
    for (const [index, outcome] of settled.entries()) {
      if (outcome.status === 'rejected') {
        addFailure(failures, outcome.reason);
        continue;
      }
      try { this.#recordExecution(entries[index]![0], outcome.value); }
      catch (error) { addFailure(failures, error); }
    }
  }

  #recordExecution(id: string, execution: NodeExecution): void {
    this.#results.set(id, execution.result);
    this.#attempts.push(...execution.attempts);
    this.#outputs.set(id, execution.outputs);
    if (execution.retainedFixture) this.#owner.retainFixture(
      this.#owner.options.plan.nodes.find(item => item.id === id)!,
      execution.retainedFixture,
    );
  }

  #applyCleanupFailures(): void {
    for (const failure of this.#owner.cleanupErrors) {
      const node = this.#owner.options.plan.nodes.find(item => item.id === failure.nodeId);
      if (!node) continue;
      const current = this.#results.get(node.id);
      if (!current || current.state === 'skipped' || current.state === 'cancelled') continue;
      this.#results.set(node.id, finalNodeResult(
        this.#owner.options.plan, node,
        this.#attempts.filter(attempt => attempt.nodeId === node.id), 'errored', null, null,
        { authorityId: this.#owner.authorityId, nonce: this.#owner.id() },
      ));
    }
  }
}

function addFailure(failures: unknown[], error: unknown): void {
  if (!failures.includes(error)) failures.push(error);
}

function throwFailures(failures: readonly unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'TEST_RUNNER_EXECUTION_CLEANUP_FAILED');
}
