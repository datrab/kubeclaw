import { AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES } from './constants.ts';

// Ample headroom for hook metadata while keeping later JSON.stringify safe.
export const AGENT_OBSERVABILITY_MAX_JSON_DEPTH = 256;
// Even an array of one-digit values needs approximately two bytes per value.
export const AGENT_OBSERVABILITY_MAX_JSON_NODES = Math.ceil(AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES / 2);

type Frame = { value: unknown; depth: number; leave?: boolean };
export function ingressComplexityError(value: unknown): string | undefined {
  const active = new Set<object>();
  const pending: Frame[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const frame = pending.pop()!;
    if (frame.leave) { active.delete(frame.value as object); continue; }
    if (frame.depth > AGENT_OBSERVABILITY_MAX_JSON_DEPTH) return 'event JSON depth limit exceeded';
    if (++nodes > AGENT_OBSERVABILITY_MAX_JSON_NODES) return 'event JSON node limit exceeded';
    if (!frame.value || typeof frame.value !== 'object') continue;
    if (active.has(frame.value)) return 'event must not contain JSON cycles';
    active.add(frame.value);
    const keys = Object.keys(frame.value);
    if (keys.length + nodes > AGENT_OBSERVABILITY_MAX_JSON_NODES) return 'event JSON node limit exceeded';
    pending.push({ ...frame, leave: true });
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(frame.value, key);
      if (!descriptor || !('value' in descriptor)) return 'event must not contain accessors';
      pending.push({ value: descriptor.value, depth: frame.depth + 1 });
    }
  }
  return undefined;
}
