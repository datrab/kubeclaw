import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export function createObservabilityHealthState() {
  const health = new Map<string, Record<string, any>>();
  const observedAt = (value: any, field: string) => {
    if (typeof value === 'string' && value.trim()) return value;
    return new Date().toISOString();
  };
  const restoredAfterAuthority = (value: any, degradedAt: string | null, restoredAt: string) => {
    if (value !== undefined && value !== null) return value;
    if (!degradedAt) return null;
    return Math.max(0, new Date(restoredAt).getTime() - new Date(degradedAt).getTime());
  };
  return {
    markDegraded(key: string, data: Record<string, any> = {}) {
      const prev = health.get(key);
      if (prev?.degraded) return { shouldEmit: false, duplicate: true, restored: false, key, degradedAt: selectTruthyValue(() => (prev.degradedAt), () => (null)), previous: prev };
      const degradedAt = observedAt(data.degraded_at, 'degraded_at');
      const state = { ...data, degraded: true, degradedAt };
      health.set(key, state);
      return { shouldEmit: true, duplicate: false, restored: false, key, degradedAt, previous: selectTruthyValue(() => (prev), () => (null)), state };
    },
    markRestored(key: string, data: Record<string, any> = {}) {
      const prev = health.get(key);
      if (!prev?.degraded) return { shouldEmit: false, duplicate: false, restored: false, key, degradedAt: null, previous: selectTruthyValue(() => (prev), () => (null)) };
      const restoredAt = observedAt(data.restored_at, 'restored_at');
      const degradedAt = prev.degradedAt ? prev.degradedAt : (selectDefinedValue(() => (data.degraded_at), () => (null)));
      const restoredAfterMs = restoredAfterAuthority(data.restored_after_ms, degradedAt, restoredAt);
      const state = { ...prev, ...data, degraded: false, restoredAt };
      health.set(key, state);
      return { shouldEmit: true, duplicate: false, restored: true, key, degradedAt, restoredAt, restoredAfterMs, previous: prev, state };
    },
  };
}
