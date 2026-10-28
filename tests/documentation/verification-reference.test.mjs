import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  loadVerificationGuidance, renderVerificationResponsibilities, verificationGuidancePath,
} from '../../scripts/lib/docs-verification-reference.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-reference-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  write('package.json', JSON.stringify({ scripts: { 'probe:check': 'node receiver.mjs' } }));
  write('.github/workflows/probe.yml', 'name: fixture\n');
  write('receiver.mjs', 'throw new Error("Must never execute to render documentation");\n');
  const source = { path: 'receiver.mjs', sha256: createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'receiver.mjs'))).digest('hex') };
  const contract = {
    purpose: 'Check selected proof.', scope: 'One fixture receiver.',
    environment: 'Local host with explicit authority.', effects: 'May publish an image before failing.',
    expected: 'A failure does not undo an earlier write; zero can be a skip.',
    owner: 'Fixture subsystem maintainers.', changeToCheck: 'Receiver changes require the exact check.',
    sources: [source],
  };
  const guidance = { schemaVersion: 'verification-command-guidance.v1',
    npm: [{ ...contract, id: 'probe:check', command: 'node receiver.mjs' }],
    deploy: [{ ...contract, id: './scripts/deploy.sh render <name>' }],
    ci: [{ ...contract, id: '.github/workflows/probe.yml' }],
    routes: [{ ...contract, id: 'Focused package contract checks',
      procedure: 'docs/site/extend/testing.md#package-checks' }],
    guide: [{ ...contract, id: 'node docs/site/example.mjs verify OWNED_ROOT',
      procedure: 'docs/site/use/example.md#verify' }],
  };
  const save = () => write(verificationGuidancePath, JSON.stringify(guidance));
  save();
  return { root, guidance, save, write, deploy: { commands: [{ invocation: guidance.deploy[0].id }] } };
}

test('renders qualified effects and all seven responsibilities without running the receiver', t => {
  const f = fixture(t);
  const loaded = loadVerificationGuidance(f.root, f.deploy);
  const page = renderVerificationResponsibilities(loaded, 'a'.repeat(40));
  assert.match(page, /May publish an image before failing/u);
  assert.match(page, /zero can be a skip/u);
  assert.match(page, /render &lt;name&gt;/u);
  for (const label of ['Purpose', 'Scope', 'Environment and execution place',
    'Authority, writes and remaining state', 'Expected result and limits', 'Owner', 'When this changes']) {
    assert.equal(page.split(`| ${label} |`).length - 1, 5, label);
  }
  assert.match(page, /github\.com\/datrab\/kubeclaw\/blob\/a{40}\/receiver\.mjs/u);
  assert.match(page, /complete guide procedure\]\(\.\.\/use\/example\.md#verify\)/u);
});

test('rejects missing, duplicate or changed aliases and missing responsibility instead of inferring by name', t => {
  const f = fixture(t);
  const original = structuredClone(f.guidance.npm);
  for (const rows of [[], [original[0], original[0]], [{ ...original[0], command: 'node another.mjs' }],
    [{ ...original[0], effects: '' }]]) {
    f.guidance.npm = rows; f.save();
    assert.throws(() => loadVerificationGuidance(f.root, f.deploy), /verification guidance/u);
  }
});

test('changed receiver bytes and new workflow or deployment forms require new qualification', t => {
  const f = fixture(t);
  f.write('receiver.mjs', 'console.log("changed authority");\n');
  assert.throws(() => loadVerificationGuidance(f.root, f.deploy), /source changed/u);
  f.guidance.npm[0].sources[0].sha256 = createHash('sha256')
    .update(fs.readFileSync(path.join(f.root, 'receiver.mjs'))).digest('hex');
  f.save();
  f.write('.github/workflows/new.yaml', 'name: new\n');
  assert.throws(() => loadVerificationGuidance(f.root, f.deploy), /CI identities/u);
  fs.unlinkSync(path.join(f.root, '.github/workflows/new.yaml'));
  assert.throws(() => loadVerificationGuidance(f.root,
    { commands: [...f.deploy.commands, { invocation: './scripts/deploy.sh new' }] }), /deployment identities/u);
});

test('rejects external and completion-record authority sources', t => {
  const f = fixture(t);
  for (const sourcePath of ['../outside', '/etc/passwd',
    'docs/blueprint/documentation-completion-matrix.json', 'docs/blueprint/acceptance-evidence/receipt.json']) {
    f.guidance.npm[0].sources[0].path = sourcePath; f.save();
    assert.throws(() => loadVerificationGuidance(f.root, f.deploy), /invalid source/u);
  }
});

test('an internal symlink cannot turn a completion record into implementation authority', t => {
  const f = fixture(t);
  for (const [index, forbidden] of [
    'docs/blueprint/documentation-completion-matrix.json',
    'docs/blueprint/acceptance-evidence/receipt.json',
  ].entries()) {
    f.write(forbidden, '{"record":"not command meaning authority"}\n');
    const alias = `source-alias-${index}`;
    fs.symlinkSync(path.join(f.root, forbidden), path.join(f.root, alias));
    f.guidance.npm[0].sources[0].path = alias;
    f.guidance.npm[0].sources[0].sha256 = createHash('sha256')
      .update(fs.readFileSync(path.join(f.root, alias))).digest('hex');
    f.save();
    assert.throws(() => loadVerificationGuidance(f.root, f.deploy), /invalid source/u);
  }
});

test('guide executable sources must match cited Git bytes even below the generated-page prefix', t => {
  const f = fixture(t);
  const guideSource = 'docs/site/examples/proof.mjs';
  f.write(guideSource, 'export const proof = "committed";\n');
  f.guidance.guide[0].sources = [{ path: guideSource, sha256: createHash('sha256')
    .update(fs.readFileSync(path.join(f.root, guideSource))).digest('hex') }];
  f.save();
  const git = args => execFileSync('git', args, { cwd: f.root, encoding: 'utf8' }).trim();
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'qualified guide source']);
  const revision = git(['rev-parse', 'HEAD']);
  assert.doesNotThrow(() => loadVerificationGuidance(f.root, f.deploy, revision));
  f.write(guideSource, 'export const proof = "uncommitted replacement";\n');
  f.guidance.guide[0].sources[0].sha256 = createHash('sha256')
    .update(fs.readFileSync(path.join(f.root, guideSource))).digest('hex');
  f.save();
  assert.throws(() => loadVerificationGuidance(f.root, f.deploy, revision), /does not match committed revision/u);
});

test('opted-in detached meaning roots use the invoking checkout Git bytes without weakening them', t => {
  const f = fixture(t);
  const git = args => execFileSync('git', args, { cwd: f.root, encoding: 'utf8' }).trim();
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'meaning authority']);
  const revision = git(['rev-parse', 'HEAD']);
  const detached = fs.mkdtempSync(path.join(os.tmpdir(), 'detached-verification-'));
  t.after(() => fs.rmSync(detached, { recursive: true, force: true }));
  fs.cpSync(f.root, detached, { recursive: true, filter: source => {
    const relative = path.relative(f.root, source);
    return relative !== '.git' && !relative.startsWith(`.git${path.sep}`);
  } });
  assert.equal(fs.existsSync(path.join(detached, '.git')), false);
  assert.doesNotThrow(() => loadVerificationGuidance(detached, f.deploy, revision, f.root));
  fs.writeFileSync(path.join(detached, 'receiver.mjs'), 'throw Error("changed authority");\n');
  const guidance = JSON.parse(fs.readFileSync(path.join(detached, verificationGuidancePath), 'utf8'));
  const changed = createHash('sha256').update(fs.readFileSync(path.join(detached, 'receiver.mjs'))).digest('hex');
  for (const family of ['npm', 'deploy', 'ci', 'guide', 'routes']) {
    for (const row of guidance[family]) row.sources[0].sha256 = changed;
  }
  fs.writeFileSync(path.join(detached, verificationGuidancePath), JSON.stringify(guidance));
  assert.throws(() => loadVerificationGuidance(detached, f.deploy, revision, f.root),
    /does not match committed revision/u);
});
