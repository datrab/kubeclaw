import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { editorialSourceFiles, semanticOwnerFiles } from '../../scripts/lib/docs-retained-language-bundle.mjs';
import { PRISM_SEMANTIC_RECEIVERS } from '../../scripts/lib/docs-retained-prism-semantics.mjs';

const nativeRoot = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
function isolatedOwner(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retained-prism-native-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'repo'); fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  // Borrow immutable Git objects, never a checkout, mutable inventory or fake CLI.
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: nativeRoot, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(root, '.git/objects/info/alternates'), path.resolve(nativeRoot, common, 'objects') + '\n');
  const copied = new Set(), expanded = new Set();
  function copy(relative, closure = false) {
    if (closure ? expanded.has(relative) : copied.has(relative)) return;
    copied.add(relative);
    if (closure) expanded.add(relative);
    const filename = path.join(nativeRoot, relative); const text = fs.readFileSync(filename, 'utf8');
    const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(filename, target);
    // Actual ESM import closure; no product imports are rewritten or executed.
    if (!closure || !relative.endsWith('.mjs')) return;
    for (const match of text.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gu)) {
      copy(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])), true);
    }
  }
  // Some sources are hashed rather than imported; copy the complete declared set.
  for (const relative of [...editorialSourceFiles, ...semanticOwnerFiles, ...PRISM_SEMANTIC_RECEIVERS.map(x => x.path)]) copy(relative);
  copy('scripts/docs-retained-language-projection.mjs', true);
  git('add', '.');
  git('-c', 'user.name=Retained Semantic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Owned native semantic CLI source fixture');
  const revision = git('rev-parse', 'HEAD');
  const output = path.join(directory, 'bundle.json');
  const args = ['scripts/docs-retained-language-projection.mjs', '--root', root,
    '--editorial-revision', revision, '--output', output];
  const run = extra => spawnSync(process.execPath, [...args, ...extra], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  return { directory, root, output, args, revision, run, git };
}

test('actual native CLI v1 and v2 use authenticated Git facts; failed guards preserve old bundle', t => {
  const f = isolatedOwner(t);
  const legacy = f.run([]); assert.equal(legacy.status, 0, legacy.stderr);
  const v1 = JSON.parse(fs.readFileSync(f.output, 'utf8'));
  assert.equal(v1.schemaVersion, 'kubeclaw-retained-configuration-language.v1');
  assert.equal(v1.changes.length, 106);
  assert.equal(v1.preservation.secretsEqual, true);
  const legacyDigest = digest(fs.readFileSync(f.output));
  assert.equal(f.run(['--check']).status, 0);
  assert.equal(digest(fs.readFileSync(f.output)), legacyDigest);
  let result = f.run(['--semantic-owner-revision', '0'.repeat(40)]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /OWNER_MUST_MATCH/);
  assert.equal(digest(fs.readFileSync(f.output)), legacyDigest);
  const semanticArgs = ['--semantic-owner-revision', f.revision];
  result = f.run(semanticArgs); assert.equal(result.status, 0, result.stderr);
  const v2 = JSON.parse(fs.readFileSync(f.output, 'utf8'));
  assert.equal(v2.schemaVersion, 'kubeclaw-retained-configuration-semantics.v2');
  assert.equal(v2.meaningEvidence.environment.length, 11);
  assert.equal(v2.meaningEvidence.helm.length, 16);
  assert.equal(v2.meaningEvidence.secrets.length, 15);
  assert.equal(v2.inventories.runtimeInputs.secrets.length, 123);
  assert.equal(v2.inventories.runtimeInputs.environment.length, 435);
  assert.deepEqual(v2.changes.slice(0, 106), v1.changes);
  assert.equal(v2.limits.currentDiscoveryPerformed, false);
  assert.equal(v2.limits.currentProducerQualificationGranted, false);
  assert.equal(f.run([...semanticArgs, '--check']).status, 0);
  const authenticText = fs.readFileSync(f.output, 'utf8');
  const forged = JSON.parse(authenticText); forged.inventories.runtimeInputs.secrets[0].purpose = 'caller-edited description';
  fs.writeFileSync(f.output, JSON.stringify(forged, null, 2) + '\n');
  const forgedDigest = digest(fs.readFileSync(f.output));
  const authenticate = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import {pathToFileURL} from 'node:url'; const {readVerifiedRetainedLanguageBundle}=await import(pathToFileURL(process.argv[1]+'/scripts/lib/docs-retained-language-bundle.mjs')); readVerifiedRetainedLanguageBundle({root:process.argv[1],filename:process.argv[2]});", f.root, f.output],
  { cwd: f.root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.notEqual(authenticate.status, 0); assert.match(authenticate.stderr, /AUTHENTICATION_FAILED/);
  assert.equal(digest(fs.readFileSync(f.output)), forgedDigest);
  fs.writeFileSync(f.output, authenticText);
  const semanticDigest = digest(fs.readFileSync(f.output));
  const receiver = PRISM_SEMANTIC_RECEIVERS[0].path;
  fs.appendFileSync(path.join(f.root, receiver), '\n// changed uncommitted receiving body\n');
  result = f.run(semanticArgs); assert.notEqual(result.status, 0); assert.match(result.stderr, /SOURCE_DRIFT/);
  assert.equal(digest(fs.readFileSync(f.output)), semanticDigest);
  f.git('add', receiver); f.git('-c', 'user.name=Retained Semantic Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-m', 'Synthetic changed receiver guard negative');
  const changedRevision = f.git('rev-parse', 'HEAD');
  result = spawnSync(process.execPath, ['scripts/docs-retained-language-projection.mjs', '--root', f.root,
    '--editorial-revision', changedRevision, '--semantic-owner-revision', changedRevision, '--output', f.output],
  { cwd: f.root, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /RECEIVER_BODY_DRIFT/);
  assert.equal(digest(fs.readFileSync(f.output)), semanticDigest);
  assert(!fs.readdirSync(f.directory).some(name => name.includes('.stage-')));
});
