const COLORS = Object.freeze({ info: 0x3498db, success: 0x2ecc71, warning: 0xf1c40f, error: 0xe74c3c });
const ICONS = Object.freeze({ info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' });

function displayText(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

export function discordWebhookPayload(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const severity = typeof payload.severity === 'string' ? payload.severity : 'info';
  const title = typeof payload.title === 'string' ? payload.title : String(payload.type);
  const summary = typeof payload.summary === 'string' ? payload.summary
    : typeof payload.message === 'string' ? payload.message : title;
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const reason = typeof payload.reasonCode === 'string' ? [{ name: 'Reason', value: payload.reasonCode, inline: false }] : [];
  return Object.freeze({ allowed_mentions: Object.freeze({ parse: Object.freeze([]) }), embeds: Object.freeze([Object.freeze({
    title: displayText(`${ICONS[severity as keyof typeof ICONS] ?? 'ℹ️'} ${title}`, 256),
    description: displayText(summary, 4_096), color: COLORS[severity as keyof typeof COLORS] ?? COLORS.info,
    fields: Object.freeze([...fields, ...reason].slice(0, 25)),
    ...(typeof payload.footer === 'string' ? { footer: Object.freeze({ text: displayText(payload.footer, 2_048) }) } : {}),
    ...(typeof payload.occurredAt === 'string' ? { timestamp: payload.occurredAt } : {}),
  })]) });
}
