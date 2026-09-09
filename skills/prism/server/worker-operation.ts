import type { WorkerAttemptEnvelopeV1, WorkerAttemptLimitsV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { WorkerAttemptOperation } from '@kubeclaw/worker-core';
import type { PrismEngine } from '../engine/index.ts';
import { executePrismOperation } from '../engine/worker-binding.ts';
import type { WorkerArtifactClient } from './worker-artifacts.ts';

export function operationFor(
  envelope: WorkerAttemptEnvelopeV1,
  engine: PrismEngine,
  artifacts: WorkerArtifactClient,
): WorkerAttemptOperation {
  let prepared = false;
  let terminated = false;
  return {
    prepare(limits: WorkerAttemptLimitsV1) {
      if (
        limits.cpuMillis > 4000 ||
        limits.memoryBytes > 8_589_934_592 ||
        limits.processes > 256
      )
        throw new Error("Prism attempt exceeds the worker resource boundary");
      prepared = true;
      return undefined;
    },
    async execute(context) {
      if (!prepared || terminated || context.signal.aborted)
        throw new Error("Prism attempt cannot start");
      if (envelope.operation.values.operation === "generate")
        throw new Error("Prism generation requires the OpenClaw agent gateway");
      context.log(
        "system",
        `Prism ${String(envelope.operation.values.operation)} operation started`,
      );
      const hydratedInput = await readInput(envelope, artifacts, context.signal);
      const specialistResult = await executePrismOperation(
        engine,
        envelope.operation,
        envelope.executionId,
        hydratedInput,
      );
      if (terminated || context.signal.aborted)
        throw new Error("Prism attempt was cancelled");
      const values={...specialistResult.values};const evidence=[];
      if(typeof values.screenshotBase64==="string"){evidence.push(await artifacts.upload("render-screenshot","preview","image/png",Buffer.from(values.screenshotBase64,"base64"), AbortSignal.timeout(envelope.limits.cleanupTimeoutMs)));delete values.screenshotBase64;}
      if(typeof values.ariaSnapshot==="string"){evidence.push(await artifacts.upload("render-aria","accessibility-tree","text/plain",Buffer.from(values.ariaSnapshot), AbortSignal.timeout(envelope.limits.cleanupTimeoutMs)));delete values.ariaSnapshot;}
      const boundedResult={...specialistResult,values};
      return {
        summary: "Prism operation completed",
        specialistResult:boundedResult,
        evidence,
        exitCode: 0,
        signal: null,
      };
    },
    async terminate() {
      terminated = true;
    },
    async measure() {
      return {
        cpuTimeMs: Math.round(process.cpuUsage().user / 1000),
        maximumMemoryBytes: process.memoryUsage().rss,
        maximumProcesses: 1,
      };
    },
  };
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
