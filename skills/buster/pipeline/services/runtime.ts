function normalizeDiscordWebhookUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function resolveDiscordWebhookUrl(override: unknown = null): string | null {
  return normalizeDiscordWebhookUrl(override)
    || normalizeDiscordWebhookUrl(process.env.DISCORD_WEBHOOK_URL)
    || normalizeDiscordWebhookUrl(process.env.DISCORD_WEBHOOK)
    || null;
}
