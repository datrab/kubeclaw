import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function requireFirst(candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function loadRedisCtor() {
  const mod = requireFirst([
    'ioredis',
    '/app/node_modules/ioredis',
    '/usr/local/lib/node_modules/ioredis',
  ]);
  return mod?.default || mod;
}

export function resolveDiscordWebhookUrl(override = null) {
  return override || process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK || null;
}
