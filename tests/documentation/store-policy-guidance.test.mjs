import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadStorePolicyGuidance, storePolicyGuidancePath } from '../../scripts/lib/docs-store-policy-guidance.mjs';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-policy-custody-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q');
    fs.mkdirSync(path.join(root, 'docs/blueprint'), { recursive: true });
    const source = 'export const LIMIT = 3 * 1024;\n';
    fs.writeFileSync(path.join(root, 'runtime.ts'), source);
    const family = { id: 'owner', category: 'admission', owner: 'actual component owner',
      pathMeaning: 'Selected caller root.', retentionMeaning: 'Admission is not age deletion.',
      cleanupTrigger: 'No cleanup operation is selected by this declaration.',
      failureBoundary: 'Caller must retain its original state.', retainedAuthority: 'Original records.',
      explanation: 'docs/site/reference/stores-and-retention.md#capacity-is-not-one-universal-byte-limit',
      authorities: [{ id: 'limit', role: 'literal limit declaration', source: 'runtime.ts',
        selector: { kind: 'typescript', variable: 'LIMIT' } }] };
    const stores = [{ source: 'runtime.ts', value: 'configured-state' }];
    const guidance = { schemaVersion: 'store-policy-guidance.v1', families: [family],
      bindings: [{ ...stores[0], policyFamilies: ['owner'] }], additionalInstances: [] };
    function commit() {
      fs.writeFileSync(path.join(root, storePolicyGuidancePath), JSON.stringify(guidance));
      git('add', '.');
      git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'native policy fixture');
      return git('rev-parse', 'HEAD');
    }
    run({ root, source, family, stores, guidance, commit });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('actual temporary Git source and registry bytes bind values and store responsibilities', () => fixture(f => {
  const result = loadStorePolicyGuidance(f.root, f.stores, f.commit());
  assert.equal(result.storePolicies[0].authorities[0].value, 3072);
  assert.deepEqual(result.stores[0].policyFamilies, ['owner']);
  assert.deepEqual(result.policySourcePaths, [storePolicyGuidancePath, 'runtime.ts'].sort());
}));

test('changed product or authored registry bytes cannot reuse the cited commit', () => fixture(f => {
  const revision = f.commit();
  fs.writeFileSync(path.join(f.root, 'runtime.ts'), 'export const LIMIT = 99;\n');
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, revision), /source differs from cited revision/u);
  fs.writeFileSync(path.join(f.root, 'runtime.ts'), f.source);
  f.family.retentionMeaning = 'An uncommitted replacement meaning.';
  fs.writeFileSync(path.join(f.root, storePolicyGuidancePath), JSON.stringify(f.guidance));
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, revision), /source differs from cited revision/u);
}));

test('completion records and filesystem aliases cannot become product authority', () => fixture(f => {
  f.family.authorities[0].source = 'docs/blueprint/documentation-completion-matrix.json';
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, f.commit()), /invalid source authority/u);
  f.family.authorities[0].source = 'alias.ts';
  fs.symlinkSync('runtime.ts', path.join(f.root, 'alias.ts'));
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, f.commit()), /contained regular file/u);
}));

test('new store discoveries and unresolved source/caller joins stop rather than inherit generic policy', () => fixture(f => {
  let revision = f.commit();
  assert.throws(() => loadStorePolicyGuidance(f.root, [...f.stores, { source: 'runtime.ts', value: 'new-state' }], revision),
    /discovered-store coverage changed/u);
  assert.throws(() => loadStorePolicyGuidance(f.root, [{ source: 'runtime.ts', value: 'different-state' }], revision),
    /no qualified policy/u);
  f.guidance.additionalInstances.push({ id: 'instance', pathIdentity: 'selected dynamic root',
    publicBoundary: 'The actual selected caller only.', policyFamilies: ['owner'],
    sourceAuthorityIds: ['limit'], callerAuthorityIds: ['missing-caller'] });
  revision = f.commit();
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, revision), /actual source and caller/u);
}));

test('qualified caller context is digest-bound, range-bound and not an evaluated policy value', () => fixture(f => {
  f.family.qualifiedContextSources = [{ source: 'runtime.ts', role: 'bounded caller context only',
    sourceSha256: createHash('sha256').update(f.source).digest('hex'), startLine: 1, endLine: 1 }];
  const result = loadStorePolicyGuidance(f.root, f.stores, f.commit());
  assert.equal(result.storePolicies[0].qualifiedContexts[0].representation, 'qualified-context-not-policy-value');
  assert(!Object.hasOwn(result.storePolicies[0].qualifiedContexts[0], 'value'));
  f.family.qualifiedContextSources[0].endLine = 2;
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, f.commit()), /qualified caller context changed/u);
}));

test('full owner acquisition publishes bounded references rather than unrelated implementation bodies', () => fixture(f => {
  const source = `${f.source}export class Owner { cleanup(){ return '0000000000000000'; } }\n`;
  fs.writeFileSync(path.join(f.root, 'runtime.ts'), source);
  f.family.authorities.push({ id: 'cleanup', role: 'complete owner cleanup API boundary',
    source: 'runtime.ts', selector: { kind: 'typescript', class: 'Owner' } });
  const result = loadStorePolicyGuidance(f.root, f.stores, f.commit());
  const authority = result.storePolicies[0].authorities[1];
  assert.equal(authority.sourceSha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(authority.representation, 'source-reference');
  assert(!Object.hasOwn(authority, 'expression'));
  assert(!JSON.stringify(result).includes('0000000000000000'));
  assert.equal(result.storePolicies[0].authorities[0].expression, '3 * 1024');
}));

test('qualified authority identity refuses a committed container/environment reorder', () => fixture(f => {
  const source = `${f.source}export const HOST = {name:'buster-v2-runtime', env:{name:'CONTAINER_BUILD_BUILDKIT_HOST'}};\n`;
  fs.writeFileSync(path.join(f.root, 'runtime.ts'), source);
  f.family.authorities.push({ id: 'host', role: 'actual selected container identity', source: 'runtime.ts',
    selector: { kind: 'typescript', variable: 'HOST', property: ['name'] } });
  f.family.authorities.push({ id: 'environment', role: 'actual named socket declaration', source: 'runtime.ts',
    selector: { kind: 'typescript', variable: 'HOST', property: ['env'] } });
  f.family.identityExpectations = [{ authority: 'host', equals: 'buster-v2-runtime' },
    { authority: 'environment', property: 'name', equals: 'CONTAINER_BUILD_BUILDKIT_HOST' }];
  assert.equal(loadStorePolicyGuidance(f.root, f.stores, f.commit()).storePolicies[0].identityExpectations.length, 2);
  fs.writeFileSync(path.join(f.root, 'runtime.ts'), source.replace('buster-v2-runtime', 'unrelated-container'));
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, f.commit()), /selected authority identity changed/u);
  fs.writeFileSync(path.join(f.root, 'runtime.ts'), source.replace('CONTAINER_BUILD_BUILDKIT_HOST', 'UNRELATED_HOST'));
  assert.throws(() => loadStorePolicyGuidance(f.root, f.stores, f.commit()), /selected authority identity changed/u);
}));
