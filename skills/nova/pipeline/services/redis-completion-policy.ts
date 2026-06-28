type RedisCompletionPolicy = {
  archiveMaxLen: number;
  tailScanBatchSize: number;
  tailScanLimit: number;
};

function positiveInteger(config: Record<string, any>, field: string): number {
  const value = Number(config?.redis_completion?.[field]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`config.redis_completion.${field}: required positive integer in swarm.config.json`);
  }
  return value;
}

export function resolveRedisCompletionPolicy(config: Record<string, any> = {}): RedisCompletionPolicy {
  return {
    archiveMaxLen: positiveInteger(config, 'archive_max_len'),
    tailScanBatchSize: positiveInteger(config, 'tail_scan_batch_size'),
    tailScanLimit: positiveInteger(config, 'tail_scan_limit'),
  };
}
