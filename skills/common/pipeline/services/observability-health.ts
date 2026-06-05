export function createObservabilityHealthState() {
  const health = new Map<string, Record<string, any>>();
  return {
    markDegraded(key: string, data: Record<string, any> = {}) {
      const prev = health.get(key);
      if (prev?.degraded) return { shouldEmit: false, duplicate: true, restored: false, key, degradedAt: prev.degradedAt || null, previous: prev };
      const degradedAt = data.degraded_at || new Date().toISOString();
      const state = { ...data, degraded: true, degradedAt };
      health.set(key, state);
      return { shouldEmit: true, duplicate: false, restored: false, key, degradedAt, previous: prev || null, state };
    },
    markRestored(key: string, data: Record<string, any> = {}) {
      const prev = health.get(key);
      if (!prev?.degraded) return { shouldEmit: false, duplicate: false, restored: false, key, degradedAt: null, previous: prev || null };
      const restoredAt = data.restored_at || new Date().toISOString();
      const degradedAt = prev.degradedAt || data.degraded_at || null;
      const restoredAfterMs = data.restored_after_ms ?? (degradedAt && restoredAt ? Math.max(0, new Date(restoredAt).getTime() - new Date(degradedAt).getTime()) : null);
      const state = { ...prev, ...data, degraded: false, restoredAt };
      health.set(key, state);
      return { shouldEmit: true, duplicate: false, restored: true, key, degradedAt, restoredAt, restoredAfterMs, previous: prev, state };
    },
  };
}
