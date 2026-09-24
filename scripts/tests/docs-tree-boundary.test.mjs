import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '../..');

function run(root, command, args = [], options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'ignore',
  });
}

function write(root, relative, value) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-doc-tree-'));
  write(root, 'scripts/docs-tree-boundary.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/docs-tree-boundary.mjs'), 'utf8'));
  write(root, 'docs/site/README.md', '# Canonical\n');
  write(root, 'docs/legacy.md', '# Source\n\nA retained fact.\n');
  if (options.fixture) {
    write(root, 'docs/architecture/fixture.json', '{"ok":true}\n');
    write(root, 'tests/check.mjs', "import fs from 'node:fs'; fs.readFileSync('docs/architecture/fixture.json');\n");
  }
  if (options.indirectFixture) {
    write(root, 'docs/architecture/fixture.json', '{"ok":true}\n');
    write(root, 'docs/architecture/executable-plan.md',
      '# Executable plan\n\nInput: `docs/architecture/fixture.json`\n');
    write(root, 'tests/check.mjs',
      "import fs from 'node:fs'; fs.readFileSync('docs/architecture/executable-plan.md');\n");
  }
  if (options.structuredChain) {
    write(root, 'docs/architecture/root.json', '{"next":"docs/architecture/middle.yaml"}\n');
    write(root, 'docs/architecture/middle.yaml',
      'cycle: docs/architecture/root.json\ntarget: docs/architecture/fixture.json\n');
    write(root, 'docs/architecture/fixture.json', '{"ok":true}\n');
    write(root, 'tests/check.mjs',
      "import fs from 'node:fs'; fs.readFileSync('docs/architecture/root.json');\n");
  }
  if (options.blueprintReference) {
    write(root, 'docs/blueprint/evidence.json', '{"source":"docs/legacy.md"}\n');
    write(root, 'tests/check.mjs',
      "import fs from 'node:fs'; fs.readFileSync('docs/blueprint/evidence.json');\n");
  }
  run(root, 'git', ['init', '-q']);
  run(root, 'git', ['config', 'user.name', 'Docs Test']);
  run(root, 'git', ['config', 'user.email', 'docs-test@example.invalid']);
  run(root, 'git', ['add', '.']);
  run(root, 'git', ['commit', '-qm', 'baseline']);
  const revision = run(root, 'git', ['rev-parse', 'HEAD'], { capture: true }).trim();
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', `--capture-baseline=${revision}`]);
  fs.mkdirSync(path.join(root, 'docs/_legacy-source'), { recursive: true });
  run(root, 'git', ['mv', 'docs/legacy.md', 'docs/_legacy-source/legacy.md']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--bootstrap-classification']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
  return root;
}

function mustFail(root, expected) {
  assert.throws(() => run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check'], { capture: true }),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes(expected));
}

test('rejects an unclassified documentation file', () => {
  const root = fixture();
  write(root, 'docs/new-undocumented.md', '# New\n');
  mustFail(root, 'unclassified documentation files');
});

test('rejects an executable fixture placed in the legacy reader tree', () => {
  const root = fixture({ fixture: true });
  fs.mkdirSync(path.join(root, 'docs/_legacy-source/architecture'), { recursive: true });
  run(root, 'git', ['mv', 'docs/architecture/fixture.json', 'docs/_legacy-source/architecture/fixture.json']);
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const record = registry.files.find((item) => item.path === 'docs/architecture/fixture.json');
  record.path = 'docs/_legacy-source/architecture/fixture.json';
  record.expectedPath = record.path;
  record.class = 'legacy-extraction-source';
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'an executable source consumes this file');
});

test('rejects an indirect executable input placed in the legacy reader tree', () => {
  const root = fixture({ indirectFixture: true });
  fs.mkdirSync(path.join(root, 'docs/_legacy-source/architecture'), { recursive: true });
  run(root, 'git', ['mv', 'docs/architecture/fixture.json', 'docs/_legacy-source/architecture/fixture.json']);
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const record = registry.files.find((item) => item.path === 'docs/architecture/fixture.json');
  record.path = 'docs/_legacy-source/architecture/fixture.json';
  record.expectedPath = record.path;
  record.class = 'legacy-extraction-source';
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'through a documentation dependency');
});

test('rejects a deletable classification for an executable-reachable document', () => {
  const root = fixture({ indirectFixture: true });
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const record = registry.files.find((item) => item.path === 'docs/architecture/fixture.json');
  record.class = 'deletable-remainder';
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'must be classified as internal-documentation-input');
});

test('follows structured dependency carriers across multiple hops', () => {
  const root = fixture({ structuredChain: true });
  const inventory = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/generated/inventory/documentation-tree.json'), 'utf8'));
  const fixtureRecord = inventory.files.find((item) => item.path === 'docs/architecture/fixture.json');
  assert.deepEqual(fixtureRecord.indirectExecutableConsumers, [{
    executableSource: 'tests/check.mjs',
    via: ['docs/architecture/root.json', 'docs/architecture/middle.yaml'],
  }]);
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const record = registry.files.find((item) => item.path === 'docs/architecture/fixture.json');
  record.class = 'deletable-remainder';
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'must be classified as internal-documentation-input');
});

test('does not promote provenance references from the blueprint tree', () => {
  const root = fixture({ blueprintReference: true });
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('finds an untracked executable consumer', () => {
  const root = fixture();
  write(root, 'tests/untracked-check.mjs',
    "import fs from 'node:fs'; fs.readFileSync('docs/_legacy-source/legacy.md');\n");
  mustFail(root, 'an executable source consumes this file');
});

test('rejects deletion even when its classification record is also removed', () => {
  const root = fixture();
  fs.unlinkSync(path.join(root, 'docs/_legacy-source/legacy.md'));
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.files = registry.files.filter((item) => item.originalPath !== 'docs/legacy.md');
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'baseline documentation disappeared without deletion approval');
});

test('rejects an active reference to the old reader path', () => {
  const root = fixture();
  write(root, 'README.md', 'Read [the old page](docs/legacy.md).\n');
  run(root, 'git', ['add', 'README.md']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  mustFail(root, 'active files still reference legacy reader paths');
});

test('rejects changes to immutable extraction-source bytes', () => {
  const root = fixture();
  fs.appendFileSync(path.join(root, 'docs/_legacy-source/legacy.md'), '\nChanged.\n');
  mustFail(root, 'legacy extraction bytes changed');
});
