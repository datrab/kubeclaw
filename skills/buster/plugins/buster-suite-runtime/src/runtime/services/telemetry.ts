type RecordValue = Record<string, unknown>;

export interface BusterTelemetryContext {
  readonly project?: string;
  readonly runId?: string;
  readonly moduleId?: string;
  readonly gateId?: string;
  readonly gateType?: string;
  readonly dispatchId?: string;
  readonly sessionKey?: string;
}

// The remote worker has no lifecycle or telemetry transport authority. Suite
// evidence is returned in buster-suite-result.v2 and Nova journals it through
// the canonical effect and lifecycle paths.
export function createTelemetryContext(options: RecordValue = {}): BusterTelemetryContext {
  return Object.freeze({ ...options }) as BusterTelemetryContext;
}

export async function emitEvent(
  _context: unknown,
  _type: string,
  _data: RecordValue = {},
): Promise<void> {}

export async function emitPluginEvent(
  context: unknown,
  pluginEvent: string,
  data: RecordValue = {},
): Promise<void> {
  return emitEvent(context, `plugin.${pluginEvent}`, data);
}

export async function closeTelemetry(_context: unknown): Promise<void> {}
