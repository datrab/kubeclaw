type AnyRecord = Record<string, any>;

export function workerControlMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

export function typedWorkerControl(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.typed?.worker && typeof controlResult.diagnostics.typed.worker === 'object'
    ? controlResult.diagnostics.typed.worker
    : {};
}

export function typedWorkerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  const worker = typedWorkerControl(controlResult);
  return worker.metadata && typeof worker.metadata === 'object' ? worker.metadata : {};
}

export function workerControlOutcomeClass(controlResult: AnyRecord | null = null): string | null {
  const worker = typedWorkerControl(controlResult);
  const direct = typeof worker.outcomeClass === 'string' && worker.outcomeClass.trim() ? worker.outcomeClass : null;
  const metadata = typeof worker.metadata?.outcomeClass === 'string' && worker.metadata.outcomeClass.trim()
    ? worker.metadata.outcomeClass
    : null;
  return direct || metadata;
}

export function workerControlSummary(controlResult: AnyRecord | null = null): string | null {
  const summary = controlResult?.diagnostics?.summary;
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
}

export function isRetryableWorkerStartupReason(reason: string | null = null): boolean {
  return reason !== null && ['healthcheck_failed', 'startup_evidence_missing', 'rate_limited'].includes(reason);
}
