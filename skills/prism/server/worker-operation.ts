import type { WorkerAttemptEnvelopeV1, WorkerAttemptLimitsV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { WorkerAttemptContext, WorkerAttemptOperation, WorkerAttemptOperationResult } from '@kubeclaw/worker-core';
import type { PrismEngine } from '../engine/index.ts';
import { executePrismOperation } from '../engine/worker-binding.ts';
import type { WorkerArtifactClient } from './worker-artifacts.ts';
import { PrismBrowserCloseError } from '../engine/browser-capture.ts';

export function operationFor(envelope: WorkerAttemptEnvelopeV1, engine: PrismEngine,
  artifacts: WorkerArtifactClient): WorkerAttemptOperation {
  return new PrismWorkerOperation(envelope, engine, artifacts);
}

class PrismWorkerOperation implements WorkerAttemptOperation {
  private prepared = false;
  private terminated = false;
  private readonly controller = new AbortController();
  private baseline: NodeJS.CpuUsage | undefined;
  private maximumObservedMemoryBytes = 0;
  private execution: Promise<WorkerAttemptOperationResult> | undefined;
  private settlement: Promise<{ ok: true } | { ok: false; error: unknown }> | undefined;
  private readonly envelope: WorkerAttemptEnvelopeV1;
  private readonly engine: PrismEngine;
  private readonly artifacts: WorkerArtifactClient;
  constructor(envelope: WorkerAttemptEnvelopeV1, engine: PrismEngine, artifacts: WorkerArtifactClient) {
    this.envelope = envelope; this.engine = engine; this.artifacts = artifacts;
  }
  prepare(limits: WorkerAttemptLimitsV1) {
    if (this.prepared || this.terminated) throw new Error('Prism attempt cannot be prepared again');
    if (
      limits.cpuMillis > 4000 ||
      limits.memoryBytes > 8_589_934_592 ||
      limits.processes > 256
    )
      throw new Error("Prism attempt exceeds the worker resource boundary");
    this.baseline = process.cpuUsage();
    this.prepared = true;
    return undefined;
  }
  execute(context: WorkerAttemptContext) {
    if (this.execution) throw new Error('Prism attempt execution already started');
    const signal = AbortSignal.any([context.signal, this.controller.signal]);
    this.execution = this.run({ ...context, signal });
    this.settlement = this.execution.then(() => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }));
    return this.execution;
  }
  async terminate() {
    this.terminated = true;
    this.controller.abort(new Error('Prism attempt terminated'));
    // Core bounds this drain and reports unresolved work; do not detach I/O.
    const settled = await this.settlement;
    if (settled && !settled.ok && settled.error instanceof PrismBrowserCloseError) throw settled.error;
  }
  async measure() {
    if (!this.baseline) throw new Error('Prism attempt measurement was not prepared');
    const delta = process.cpuUsage(this.baseline);
    // Preserve the actual sampled maximum across Core's execution and terminal
    // observations. This remains shared-parent RSS, not an attempt-tree peak.
    this.maximumObservedMemoryBytes = Math.max(this.maximumObservedMemoryBytes, process.memoryUsage().rss);
    return {
      // Core measures again after evidence and full-log storage. Freezing at
      // execute() settlement would exclude that completion work. The separate
      // shared-process ownership limitation still applies to this counter.
      cpuTimeMs: Math.round((delta.user + delta.system) / 1000),
      maximumMemoryBytes: this.maximumObservedMemoryBytes,
      maximumProcesses: 1,
    };
  }
  private async run(context: WorkerAttemptContext) {
    if (!this.prepared || this.terminated || context.signal.aborted)
      throw new Error("Prism attempt cannot start");
    if (this.envelope.operation.values.operation === "generate")
      throw new Error("Prism generation requires the OpenClaw agent gateway");
    context.log(
      "system",
      `Prism ${String(this.envelope.operation.values.operation)} operation started`,
    );
    const hydratedInput = await readInput(this.envelope, this.artifacts, context.signal);
    const specialistResult = await executePrismOperation(
      this.engine,
      this.envelope.operation,
      this.envelope.executionId,
      hydratedInput,
      context.signal,
    );
    if (this.terminated || context.signal.aborted)
      throw new Error("Prism attempt was cancelled");
    const values={...specialistResult.values};const evidence=[];
    if(typeof values.screenshotBase64==="string"){evidence.push(await this.artifacts.upload("render-screenshot","preview","image/png",Buffer.from(values.screenshotBase64,"base64"), context.signal));delete values.screenshotBase64;}
    if(typeof values.ariaSnapshot==="string"){evidence.push(await this.artifacts.upload("render-aria","accessibility-tree","text/plain",Buffer.from(values.ariaSnapshot), context.signal));delete values.ariaSnapshot;}
    const boundedResult={...specialistResult,values};
    return {
      summary: "Prism operation completed",
      specialistResult:boundedResult,
      evidence,
      exitCode: 0,
      signal: null,
    };
  }
}

async function readInput(envelope: WorkerAttemptEnvelopeV1, artifacts: WorkerArtifactClient,
  signal: AbortSignal): Promise<Record<string, unknown>> {
  const inputName = String(envelope.operation.values.inputName ?? '');
  const declared = envelope.inputs.find((item) => item.name === inputName && item.kind === 'artifact');
  if (!declared || declared.kind !== 'artifact' || declared.artifact.mediaType !== 'application/json'
    || declared.artifact.type !== 'prism-engine-input') throw new Error('Prism input artifact is missing or invalid');
  const bytes = await artifacts.read(declared.artifact, signal);
  return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
}
