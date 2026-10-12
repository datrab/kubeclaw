import type { BusterManifestPolicy } from '../../../common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';
import { loadAll } from 'js-yaml';


/** Bound parser recursion and expanded alias work before inspecting any manifest. */
export function boundedManifestDocuments(bytes: Buffer, policy: BusterManifestPolicy): unknown[] {
  const values: unknown[] = [];
  let depth = 0; let nodes = 0;
  try {
    loadAll(bytes.toString('utf8'), value => { values.push(value); }, {
      listener(event) {
        if (event === 'open') {
          if (++depth > policy.maximumDepth || ++nodes > policy.maximumNodes) throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
        } else depth -= 1;
      },
    });
  } catch (error) {
    throw new Error(`KUBERNETES_FIXTURE_MANIFEST_PARSE_FAILED: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  validateAliasGraph(values, policy);
  return values;
}

function validateAliasGraph(values: unknown[], policy: BusterManifestPolicy): void {
  const active = new WeakSet<object>(); const seen = new WeakSet<object>();
  const pending: { value: unknown; depth: number; leave?: boolean }[] = values.map(value => ({ value, depth: 0 }));
  let nodes = 0; let aliases = 0;
  while (pending.length) {
    const frame = pending.pop()!;
    if (!frame.value || typeof frame.value !== 'object') continue;
    if (frame.leave) { active.delete(frame.value); continue; }
    if (++nodes > policy.maximumNodes || frame.depth > policy.maximumDepth) throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
    if (active.has(frame.value)) throw new Error('KUBERNETES_FIXTURE_MANIFEST_ALIAS_CYCLE');
    if (seen.has(frame.value) && ++aliases > policy.maximumAliases) throw new Error('KUBERNETES_FIXTURE_MANIFEST_ALIAS_LIMIT');
    seen.add(frame.value); active.add(frame.value);
    const children = Object.values(frame.value);
    if (pending.length + children.length > policy.maximumNodes) throw new Error('KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT');
    pending.push({ ...frame, leave: true });
    for (const value of children) pending.push({ value, depth: frame.depth + 1 });
  }
}
