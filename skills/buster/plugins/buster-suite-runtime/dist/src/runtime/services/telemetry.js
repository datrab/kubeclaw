// The remote worker has no lifecycle or telemetry transport authority. Suite
// evidence is returned in buster-suite-result.v2 and Nova journals it through
// the canonical effect and lifecycle paths.
export function createTelemetryContext(options = {}) {
    return Object.freeze({ ...options });
}
export async function emitEvent(_context, _type, _data = {}) { }
export async function emitPluginEvent(context, pluginEvent, data = {}) {
    return emitEvent(context, `plugin.${pluginEvent}`, data);
}
export async function closeTelemetry(_context) { }
