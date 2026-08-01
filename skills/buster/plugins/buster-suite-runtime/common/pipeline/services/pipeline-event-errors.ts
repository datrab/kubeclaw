import { StructuredOperationError, type OperationDiagnostics } from '../operation-result.js';

export type PipelineEventDiagnostics = OperationDiagnostics;

export class PipelineEventContractError extends StructuredOperationError {
  constructor(message: string, diagnostics: PipelineEventDiagnostics = {}) {
    super('PIPELINE_EVENT_CONTRACT_INVALID', message, { diagnostics });
    this.name = 'PipelineEventContractError';
  }
}

export class PipelineEventWaitTimeoutError extends StructuredOperationError {
  constructor(message: string, diagnostics: PipelineEventDiagnostics = {}) {
    super('PIPELINE_EVENT_WAIT_TIMEOUT', message, { kind: 'retryable', diagnostics });
    this.name = 'PipelineEventWaitTimeoutError';
  }
}

export class PipelineEventWaitAbortedError extends StructuredOperationError {
  constructor(message: string, diagnostics: PipelineEventDiagnostics = {}) {
    super('PIPELINE_EVENT_WAIT_ABORTED', message, { diagnostics });
    this.name = 'PipelineEventWaitAbortedError';
  }
}
