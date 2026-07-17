import { resolveStatusDispatchId } from './correlation.ts';

type AnyRecord = Record<string, any>;

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function isModuleBusterDispatchId(value: unknown): boolean {
  const dispatchId = textValue(value);
  return Boolean(dispatchId && /^buster-module-.+-\d+-\d+$/.test(dispatchId));
}

export function resolveModuleBusterDispatchId(status: AnyRecord | null): string | null {
  const dispatchId = resolveStatusDispatchId(status);
  return isModuleBusterDispatchId(dispatchId) ? dispatchId : null;
}
