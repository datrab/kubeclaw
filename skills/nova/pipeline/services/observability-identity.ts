import { getRunId } from '../core/runtime.ts';
import { textValue } from '../value-boundary.ts';

function explicitRunId(config: any, data: any, options: any) {
  for (const candidate of [options.runId, data.run_id, config?._runId, config?.run_id]) {
    const normalized = textValue(candidate).trim();
    if (normalized) return normalized;
  }
  return null;
}

export function observabilityRunId(config: any = {}, data: any = {}, options: any = {}) {
  const explicit = explicitRunId(config, data, options);
  if (explicit) return explicit;
  try {
    return getRunId(config);
  } catch { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): an absent run identity is represented explicitly. */
    return null;
  }
}
