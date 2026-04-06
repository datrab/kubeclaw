export async function getRedisModule(config) {
  const redisPath = config?.agents?.buster?.redis_js_path || '/app/skills/pipeline/tools/redis.js';
  return import(redisPath);
}

export async function archiveModuleCompletions(config, moduleId) {
  const mod = await getRedisModule(config);
  const stream = `swarm:pipeline:${config.project}:completions`;
  if (mod.default?.archiveCompletions) {
    return mod.default.archiveCompletions(stream, moduleId);
  }
  if (mod.default?.archiveModuleCompletions) {
    return mod.default.archiveModuleCompletions(stream, moduleId);
  }
  return null;
}

export async function readCompletionFromRedis(config, moduleId) {
  const mod = await getRedisModule(config);
  const stream = `swarm:pipeline:${config.project}:completions`;
  if (mod.default?.readCompletion) {
    return mod.default.readCompletion(stream, moduleId);
  }
  if (mod.default?.readCompletionForModule) {
    return mod.default.readCompletionForModule(stream, moduleId);
  }
  return null;
}

export function mapRedisStatus(redisStatus) {
  const normalized = String(redisStatus || '').toUpperCase();
  if (normalized === 'PASS' || normalized === 'SUCCESS' || normalized === 'OK') return 'PASS';
  if (normalized === 'FAIL' || normalized === 'FAILED' || normalized === 'ERROR') return 'FAIL';
  if (normalized === 'BLOCKED') return 'BLOCKED';
  if (normalized === 'RATE_LIMITED') return 'RATE_LIMITED';
  return normalized || 'UNKNOWN';
}
