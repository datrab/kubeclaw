import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractStorePolicySource } from './docs-store-policy-source.mjs';
import { extractRenderedStorePolicy } from './docs-store-policy-rendered.mjs';

export const storePolicyGuidancePath = 'docs/blueprint/store-policy-guidance.json';
const forbiddenAuthority = file => file === 'docs/blueprint/documentation-completion-matrix.json'
  || file.startsWith('docs/blueprint/acceptance-evidence/');
const textFields = ['id', 'category', 'owner', 'pathMeaning', 'retentionMeaning',
  'cleanupTrigger', 'failureBoundary', 'retainedAuthority', 'explanation'];
const requireText = value => typeof value === 'string' && value.trim();
const identity = row => JSON.stringify([row.source, row.value]);

// Interpreted policy meanings are maintained alongside exact native selectors.
// Mechanical declarations/values come only from the selected product source.
// This loader neither executes a store nor grants cleanup/retirement authority.
export function loadStorePolicyGuidance(root, stores, revision, {
  gitRoot = root, isolatedMutation = false, renderedResources,
} = {}) {
  const physicalRoot = fs.realpathSync(root);
  const cache = new Map();
  function readAuthority(relative) {
    assert(typeof relative === 'string' && relative && !path.isAbsolute(relative)
      && !relative.includes('\\') && !relative.split('/').some(part => !part || part === '.' || part === '..')
      && !/[\r\n\t]/u.test(relative) && !forbiddenAuthority(relative),
    'DOC_DRIFT_STORE_POLICY: invalid source authority');
    if (cache.has(relative)) return cache.get(relative);
    const target = path.join(root, relative), physical = fs.realpathSync(target);
    assert(physical.startsWith(`${physicalRoot}${path.sep}`)
      && !forbiddenAuthority(path.relative(physicalRoot, physical).split(path.sep).join('/'))
      && fs.lstatSync(target).isFile(), 'DOC_DRIFT_STORE_POLICY: source is not a contained regular file');
    const bytes = fs.readFileSync(target);
    if (!isolatedMutation) {
      assert.match(revision, /^[0-9a-f]{40}$/u, 'DOC_DRIFT_STORE_POLICY: committed source revision required');
      const git = args => execFileSync('git', args, { cwd: gitRoot, encoding: 'utf8' }).trim();
      const entry = git(['ls-tree', revision, '--', relative]);
      assert(/^(?:100644|100755) blob [a-f0-9]{40}\t/u.test(entry)
        && entry.split('\t')[1] === relative, 'DOC_DRIFT_STORE_POLICY: source must be a committed regular file');
      const pinned = execFileSync('git', ['cat-file', 'blob', `${revision}:${relative}`], {
        cwd: gitRoot, maxBuffer: Math.max(1024 * 1024, bytes.length + 1),
      });
      assert(bytes.equals(pinned), `DOC_DRIFT_STORE_POLICY: source differs from cited revision: ${relative}`);
    }
    const text = bytes.toString('utf8');
    assert(Buffer.from(text, 'utf8').equals(bytes) && !text.includes('\0'),
      'DOC_DRIFT_STORE_POLICY: source must be UTF-8 text');
    cache.set(relative, text);
    return text;
  }
  const guidance = JSON.parse(readAuthority(storePolicyGuidancePath));
  assert.equal(guidance.schemaVersion, 'store-policy-guidance.v1');
  assert(Array.isArray(guidance.families) && guidance.families.length,
    'DOC_DRIFT_STORE_POLICY: policy families required');
  const ids = guidance.families.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'DOC_DRIFT_STORE_POLICY: duplicate policy family');
  const families = guidance.families.map(row => {
    assert(textFields.every(field => requireText(row[field])), 'DOC_DRIFT_STORE_POLICY: incomplete policy meaning');
    assert(Array.isArray(row.authorities) && row.authorities.length,
      'DOC_DRIFT_STORE_POLICY: selected product authorities required');
    assert.equal(new Set(row.authorities.map(item => item.id)).size, row.authorities.length,
      'DOC_DRIFT_STORE_POLICY: duplicate authority identifier');
    const authorities = row.authorities.map(authority => {
      assert(requireText(authority.id) && requireText(authority.role),
        'DOC_DRIFT_STORE_POLICY: authority identity and role required');
      const text = readAuthority(authority.source);
      const acquired = authority.selector.kind === 'rendered-resource'
        ? extractRenderedStorePolicy(authority.source, text, authority.selector, renderedResources)
        : extractStorePolicySource(authority.source, text, authority.selector);
      // Publish actual selected values/initializers, not duplicate complete
      // implementation/configuration bodies with unrelated data. Full sources
      // remain authenticated and identified by exact ranges, hashes/selectors.
      const { expression, ...reference } = acquired;
      const declaresValue = authority.selector.kind === 'yaml'
        || (authority.selector.kind === 'typescript'
          && (authority.selector.variable || authority.selector.call || authority.selector.construct));
      return { id: authority.id, role: authority.role,
        ...(authority.unit !== undefined ? { unit: authority.unit } : {}),
        ...reference,
        ...(declaresValue ? { expression } : authority.selector.kind === 'rendered-resource'
          ? {} : { representation: 'source-reference' }) };
    });
    const identityExpectations = row.identityExpectations ?? [];
    assert(Array.isArray(identityExpectations), 'DOC_DRIFT_STORE_POLICY: identity expectations must be explicit');
    for (const expectation of identityExpectations) {
      assert(requireText(expectation.authority) && requireText(expectation.equals)
        && (expectation.property === undefined || requireText(expectation.property)),
      'DOC_DRIFT_STORE_POLICY: invalid authority identity expectation');
      const authority = authorities.find(item => item.id === expectation.authority);
      assert(authority && Object.hasOwn(authority, 'value'),
        'DOC_DRIFT_STORE_POLICY: identity requires an actual selected declaration value');
      let selected = authority.value;
      if (expectation.property !== undefined) {
        assert(selected !== null && typeof selected === 'object' && Object.hasOwn(selected, expectation.property),
          'DOC_DRIFT_STORE_POLICY: authority identity property is missing');
        selected = selected[expectation.property];
      }
      assert.equal(selected, expectation.equals,
        `DOC_DRIFT_STORE_POLICY: selected authority identity changed: ${row.id} ${expectation.authority}`);
    }
    const qualifiedContexts = (row.qualifiedContextSources ?? []).map(context => {
      const source = readAuthority(context.source);
      const whole = extractStorePolicySource(context.source, source, { kind: 'complete-source' });
      assert(requireText(context.role) && context.sourceSha256 === whole.sourceSha256
        && Number.isSafeInteger(context.startLine) && Number.isSafeInteger(context.endLine)
        && context.startLine > 0 && context.endLine >= context.startLine
        && context.endLine <= whole.endLine, 'DOC_DRIFT_STORE_POLICY: qualified caller context changed');
      return { ...context, representation: 'qualified-context-not-policy-value' };
    });
    return { ...Object.fromEntries(textFields.map(field => [field, row[field]])), authorities,
      ...(identityExpectations.length ? { identityExpectations } : {}),
      ...(qualifiedContexts.length ? { qualifiedContexts } : {}) };
  });
  assert(Array.isArray(guidance.bindings), 'DOC_DRIFT_STORE_POLICY: explicit discovered-store bindings required');
  const bindings = new Map();
  for (const binding of guidance.bindings) {
    assert(requireText(binding.source) && requireText(binding.value)
      && Array.isArray(binding.policyFamilies) && binding.policyFamilies.length
      && new Set(binding.policyFamilies).size === binding.policyFamilies.length
      && binding.policyFamilies.every(id => ids.includes(id)),
    'DOC_DRIFT_STORE_POLICY: invalid discovered-store binding');
    assert(!bindings.has(identity(binding)), 'DOC_DRIFT_STORE_POLICY: duplicate discovered-store binding');
    bindings.set(identity(binding), binding);
  }
  assert.equal(bindings.size, stores.length, 'DOC_DRIFT_STORE: discovered-store coverage changed');
  const boundStores = stores.map(store => {
    const binding = bindings.get(identity(store));
    assert(binding, `DOC_DRIFT_STORE: store has no qualified policy: ${store.source} ${store.value}`);
    return { ...store, policyFamilies: binding.policyFamilies,
      interpretationLimits: binding.interpretationLimits ?? [] };
  });
  assert(Array.isArray(guidance.additionalInstances), 'DOC_DRIFT_STORE_POLICY: selected additional instances required');
  const instanceIds = new Set();
  for (const instance of guidance.additionalInstances) {
    assert(requireText(instance.id) && !instanceIds.has(instance.id)
      && requireText(instance.pathIdentity) && requireText(instance.publicBoundary)
      && Array.isArray(instance.policyFamilies) && instance.policyFamilies.length
      && instance.policyFamilies.every(id => ids.includes(id)),
    'DOC_DRIFT_STORE_POLICY: invalid additional store instance');
    const authorityIds = families.filter(row => instance.policyFamilies.includes(row.id))
      .flatMap(row => row.authorities.map(authority => authority.id));
    for (const field of ['sourceAuthorityIds', 'callerAuthorityIds']) {
      assert(Array.isArray(instance[field]) && instance[field].length
        && instance[field].every(id => authorityIds.includes(id)),
      'DOC_DRIFT_STORE_POLICY: instance must bind its actual source and caller');
    }
    instanceIds.add(instance.id);
  }
  return { stores: boundStores, storePolicies: families,
    additionalStoreInstances: guidance.additionalInstances, policySourcePaths: [...cache.keys()].sort() };
}
