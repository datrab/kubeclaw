type CredentialRecord = Record<string, unknown>;

function isRecord(value: unknown): value is CredentialRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function previewCredentialLabel(key: string): string {
  const normalized = String(key ?? '').toLowerCase();
  if (/(?:user|login|email)/.test(normalized)) return 'Login ID';
  if (/(?:pass|token|secret|api[_-]?key|key|code)/.test(normalized)) return 'Access Code';
  const label = String(key ?? '').trim() || 'Credential';
  return label
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function truncateDiscordFieldValue(value: string, max = 950): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function formatPreviewCredentialsForDiscord(
  credentials: CredentialRecord | string | null | undefined,
): string | null {
  if (!credentials) return null;
  if (typeof credentials === 'string') {
    const trimmed = credentials.trim();
    return trimmed ? truncateDiscordFieldValue(trimmed) : null;
  }
  if (!isRecord(credentials)) return null;
  const lines = Object.entries(credentials)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${previewCredentialLabel(key)}: ${String(value)}`);
  return lines.length ? truncateDiscordFieldValue(lines.join('\n')) : null;
}

export function formatPreviewCredentialCommandForDiscord(
  command: string | null | undefined,
): string | null {
  if (typeof command !== 'string') return null;
  const trimmed = command.trim();
  return trimmed ? truncateDiscordFieldValue(`\`\`\`bash\n${trimmed}\n\`\`\``) : null;
}
