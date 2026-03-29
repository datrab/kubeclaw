export function createPipelineContext({ config, progress, runId, novaChannel } = {}) {
  return {
    config,
    progress,
    runId: runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    novaChannel,
    stats: {
      started_at: new Date().toISOString(),
      modules_completed: [],
      modules_failed: [],
      modules_blocked: [],
      gates_completed: [],
      gates_failed: [],
      total_forge_attempts: 0,
      total_buster_attempts: 0,
      total_echo_reviews: 0,
      errors: [],
      discord_notifications_sent: 0,
      git_pull_failures: 0,
      git_push_failures: 0,
      config_validation_issues: [],
    },
    _logModule: null,
    _logPhase: null,
    _logFd: null,
    _pipelineLogFd: null,
    _tmpDir: null,
  };
}
