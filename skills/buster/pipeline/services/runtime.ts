declare const process: {
  env: Record<string, string | undefined>;
};

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { readBusterEnvironment } from '../buster-environment.ts';

function normalizeDiscordWebhookUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return selectTruthyValue(() => (trimmed), () => (null));
}

export function resolveDiscordWebhookUrl(override: unknown = null): string | null {
  const normalizedOverride = normalizeDiscordWebhookUrl(override);
  if (normalizedOverride !== null) return normalizedOverride;
  if (typeof override === 'string') return normalizeDiscordWebhookUrl(readBusterEnvironment('DISCORD_WEBHOOK_URL'));
  return null;
}
