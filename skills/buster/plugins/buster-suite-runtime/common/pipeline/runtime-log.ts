type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export function writeRuntimeLog(
  level: RuntimeLogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    schema_version: 'runtime_log.v1',
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  };
  console.error(JSON.stringify(entry));
}
