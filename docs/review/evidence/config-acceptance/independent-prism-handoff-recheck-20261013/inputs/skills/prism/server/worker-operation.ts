import type { WorkerAttemptEnvelopeV3, WorkerAttemptLimitsV2 } from '@kubeclaw/pipeline-worker-core-contract';
import { observeNativeWorkerResources } from '@kubeclaw/worker-core';
import type { WorkerAttemptContext, WorkerAttemptOperation, WorkerAttemptOperationResult } from '@kubeclaw/worker-core';
import type { PrismEngine } from '../engine/index.ts';
import { executePrismOperation } from '../engine/worker-binding.ts';
import type { WorkerArtifactClient } from './worker-artifacts.ts';
import { PrismBrowserCloseError } from '../engine/browser-capture.ts';

/** The same Prism lifecycle runs inside the dedicated native host. */
export function nativeOperationFor(envelope: WorkerAttemptEnvelopeV3, engine: PrismEngine,
  artifacts: WorkerArtifactClient, scope: string): WorkerAttemptOperation<WorkerAttemptEnvelopeV3> {
  const operation = new PrismWorkerOperation(envelope, engine, artifacts);
  return {
    prepare: limits => operation.prepare(limits), execute: context => operation.execute(context),
    terminate: () => operation.terminate(),
    async measure({ signal }) {
      signal.throwIfAborted();
      const resources = observeNativeWorkerResources(scope);
      return { cpuTimeMs: { status: 'observed', value: Math.ceil(resources.cpuTimeMicroseconds / 1000) },
        maximumMemoryBytes: { status: 'observed', value: resources.maximumMemoryBytes },
        maximumTasks: { status: 'observed', value: resources.maximumTasks } };
    },
  };
}

export class PrismWorkerOperation implements Omit<WorkerAttemptOperation<WorkerAttemptEnvelopeV3>, 'measure'> {
  private prepared = false;
  private terminated = false;
  private readonly controller = new AbortController();
  private execution: Promise<WorkerAttemptOperationResult> | undefined;
  private settlement: Promise<{ ok: true } | { ok: false; error: unknown }> | undefined;
  private readonly envelope: WorkerAttemptEnvelopeV3;
  private readonly engine: PrismEngine;
  private readonly artifacts: WorkerArtifactClient;
  constructor(envelope: WorkerAttemptEnvelopeV3, engine: PrismEngine, artifacts: WorkerArtifactClient) {
    this.envelope = envelope; this.engine = engine; this.artifacts = artifacts;
  }
  prepare(_limits: WorkerAttemptLimitsV2) {
    if (this.prepared || this.terminated) throw new Error('Prism attempt cannot be prepared again');
    this.prepared = true;
    return undefined;
  }
  execute(context: Pick<WorkerAttemptContext, 'signal' | 'log'>) {
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
  private async run(context: Pick<WorkerAttemptContext, 'signal' | 'log'>) {
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

async function readInput(envelope: WorkerAttemptEnvelopeV3, artifacts: WorkerArtifactClient,
  signal: AbortSignal): Promise<Record<string, unknown>> {
  const inputName = String(envelope.operation.values.inputName ?? '');
  const declared = envelope.inputs.find((item) => item.name === inputName && item.kind === 'artifact');
  if (!declared || declared.kind !== 'artifact' || declared.artifact.mediaType !== 'application/json'
    || declared.artifact.type !== 'prism-engine-input') throw new Error('Prism input artifact is missing or invalid');
  const bytes = await artifacts.read(declared.artifact, signal);
  return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
}
