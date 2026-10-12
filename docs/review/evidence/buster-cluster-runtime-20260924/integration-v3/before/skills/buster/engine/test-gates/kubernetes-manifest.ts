import { loadAll } from 'js-yaml';

const MAX_NODES = 100_000;
const MAX_DEPTH = 64;
const MAX_ALIASES = 1_000;

/** Bound parser recursion and expanded alias work before inspecting any manifest. */
export function boundedManifestDocuments(bytes: Buffer): unknown[] {
  const values: unknown[] = [];
  let depth = 0; let nodes = 0;
  try {
    loadAll(bytes.toString('utf8'), value => { values.push(value); }, {
      listener(event) {
        if (event === 'open') {
          if (++depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
        } else depth -= 1;
      },
    });
  } catch (error) {
    throw new Error(`KUBERNETES_FIXTURE_MANIFEST_PARSE_FAILED: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  validateAliasGraph(values);
  return values;
}

function validateAliasGraph(values: unknown[]): void {
  const active = new WeakSet<object>(); const seen = new WeakSet<object>();
  const pending: { value: unknown; depth: number; leave?: boolean }[] = values.map(value => ({ value, depth: 0 }));
  let nodes = 0; let aliases = 0;
  while (pending.length) {
    const frame = pending.pop()!;
    if (!frame.value || typeof frame.value !== 'object') continue;
    if (frame.leave) { active.delete(frame.value); continue; }
    if (++nodes > MAX_NODES || frame.depth > MAX_DEPTH) throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
    if (active.has(frame.value)) throw new Error('KUBERNETES_FIXTURE_MANIFEST_ALIAS_CYCLE');
    if (seen.has(frame.value) && ++aliases > MAX_ALIASES) throw new Error('KUBERNETES_FIXTURE_MANIFEST_ALIAS_LIMIT');
    seen.add(frame.value); active.add(frame.value);
    const children = Object.values(frame.value);
    if (pending.length + children.length > MAX_NODES) throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
    pending.push({ ...frame, leave: true });
    for (const value of children) pending.push({ value, depth: frame.depth + 1 });
  }
}
