type UnknownRecord = Record<string, any>;

export function isNotificationRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function notificationRecord(value: unknown): UnknownRecord {
  return isNotificationRecord(value) ? value : {};
}

export function optionalNotificationText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function requiredNotificationText(value: unknown, label: string): string {
  const text = optionalNotificationText(value);
  if (!text) throw new Error(`${label}: required non-empty string`);
  return text;
}

export function firstNotificationText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = optionalNotificationText(value);
    if (text !== null) return text;
  }
  return null;
}

export function notificationEventPayload(input: UnknownRecord): UnknownRecord {
  return notificationRecord(input?.event?.payload);
}

export function canonicalNotificationEmitter(value: unknown): string {
  return requiredNotificationText(value, 'notification.event.emitter');
}

export async function readNotificationConfig(ctx: UnknownRecord = {}): Promise<UnknownRecord> {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Notification plugin requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}
