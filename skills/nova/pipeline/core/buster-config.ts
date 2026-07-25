import { validateSafePath } from './paths.ts';

type AnyRecord = Record<string, any>;

export function validateBusterConfig(config: AnyRecord) {
  const buster = config.agents?.buster;
  if (!buster) throw new Error('config.agents.buster missing');
  if (buster.dispatch !== 'redis') throw new Error('Buster must use redis dispatch');
  if (!buster.redis_js_path) throw new Error('Buster redis_js_path missing');
  validateSafePath(buster.redis_js_path, 'config.agents.buster.redis_js_path');
  return true;
}
