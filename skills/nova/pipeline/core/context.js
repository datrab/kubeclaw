import { bindRunContext, createRunId, createRunStats } from './runtime.js';

export function createPipelineContext({ config, progress, runId, novaChannel, stats } = {}) {
  const ctx = {
    config,
    progress,
    runId: runId || config?._runId || createRunId(),
    novaChannel,
    stats: stats || config?._runStats || createRunStats(),
    _logModule: null,
    _logPhase: null,
    _logFd: null,
    _pipelineLogFd: null,
    _tmpDir: null,
  };

  bindRunContext(config, ctx);
  return ctx;
}
