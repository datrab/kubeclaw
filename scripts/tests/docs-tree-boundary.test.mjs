import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { atomicWriteTreeOutput, parseTreeArguments } from '../docs-tree-boundary.mjs';

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

function failFileSystem(method) {
  const injected = Object.create(fs);
  injected[method] = () => { throw Object.assign(new Error(`injected ${method} failure`), { code: 'EIO' }); };
  return injected;
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
  if (options.parityProvenance) {
    write(root, 'docs/generated/inventory/documentation-parity-units.jsonl',
      `${'{"originalPath":"docs/legacy.md","legacyPath":"docs/_legacy-source/legacy.md"}\n'.repeat(100)}`);
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

test('rejects a physical documentation file even when Git ignores it', () => {
  const root = fixture();
  write(root, '.gitignore', 'docs/ignored-reader-note.md\n');
  write(root, 'docs/ignored-reader-note.md', '# Hidden from Git\n');
  assert.equal(run(root, 'git', ['check-ignore', 'docs/ignored-reader-note.md'], { capture: true }).trim(),
    'docs/ignored-reader-note.md');
  mustFail(root, 'unclassified documentation files: docs/ignored-reader-note.md');
});

test('generated, classification, and baseline outputs retain existing bytes on write/rename failures', () => {
  const outputs = [
    'docs/generated/inventory/documentation-tree.json',
    'docs/config/documentation-tree-classification.json',
    'docs/config/documentation-tree-baseline.json',
  ];
  for (const pathname of outputs) {
    for (const method of ['writeFileSync', 'renameSync']) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-atomic-'));
      write(root, pathname, 'existing valid bytes\n');
      const absolute = path.join(root, pathname);
      const status = fs.statSync(absolute, { bigint: true });
      assert.throws(() => atomicWriteTreeOutput(root, pathname, 'replacement bytes\n', failFileSystem(method)),
        new RegExp(`injected ${method} failure`, 'u'));
      assert.equal(fs.readFileSync(absolute, 'utf8'), 'existing valid bytes\n');
      assert.equal(fs.statSync(absolute, { bigint: true }).ino, status.ino);
      assert.deepEqual(fs.readdirSync(path.dirname(absolute)).filter((name) => /\.tmp-/u.test(name)), []);
    }
  }
});

test('CLI modes reject combinations, duplicates, empty values, and unknown arguments without writes', () => {
  assert.deepEqual(parseTreeArguments([]), { mode: 'generate' });
  assert.deepEqual(parseTreeArguments(['--check']), { mode: 'check' });
  assert.deepEqual(parseTreeArguments(['--capture-baseline=HEAD']),
    { mode: 'capture-baseline', revision: 'HEAD' });

  const cases = [
    ['--check', '--capture-baseline=HEAD'],
    ['--check', '--bootstrap-classification'],
    ['--check', '--check'],
    ['--capture-baseline=HEAD', '--capture-baseline=HEAD~0'],
    ['--capture-baseline='],
    ['--unknown'],
  ];
  for (const args of cases) {
    const root = fixture();
    const outputs = [
      'docs/generated/inventory/documentation-tree.json',
      'docs/config/documentation-tree-classification.json',
      'docs/config/documentation-tree-baseline.json',
    ];
    const before = new Map(outputs.map((pathname) => {
      const absolute = path.join(root, pathname);
      return [pathname, {
        bytes: fs.readFileSync(absolute),
        inode: fs.statSync(absolute, { bigint: true }).ino,
      }];
    }));
    assert.throws(() => run(root, 'node', ['scripts/docs-tree-boundary.mjs', ...args], { capture: true }));
    for (const pathname of outputs) {
      const absolute = path.join(root, pathname);
      assert.deepEqual(fs.readFileSync(absolute), before.get(pathname).bytes, `${args}: changed ${pathname}`);
      assert.equal(fs.statSync(absolute, { bigint: true }).ino, before.get(pathname).inode,
        `${args}: replaced ${pathname}`);
    }
  }
});

test('all tree output locations reject symlink path components', () => {
  for (const pathname of ['docs/generated/inventory/documentation-tree.json',
    'docs/config/documentation-tree-classification.json', 'docs/config/documentation-tree-baseline.json']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-symlink-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-outside-'));
    fs.symlinkSync(outside, path.join(root, 'docs'), 'dir');
    assert.throws(() => atomicWriteTreeOutput(root, pathname, '{}\n'),
      /symbolic-link path component is forbidden/u);
  }

  const finalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-final-'));
  const outsideFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-outside-')), 'tree.json');
  fs.writeFileSync(outsideFile, 'outside\n');
  const finalPath = 'docs/generated/inventory/documentation-tree.json';
  fs.mkdirSync(path.dirname(path.join(finalRoot, finalPath)), { recursive: true });
  fs.symlinkSync(outsideFile, path.join(finalRoot, finalPath));
  assert.throws(() => atomicWriteTreeOutput(finalRoot, finalPath, '{}\n'),
    /symbolic-link path component is forbidden/u);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'outside\n');

  const danglingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-dangling-'));
  fs.mkdirSync(path.dirname(path.join(danglingRoot, finalPath)), { recursive: true });
  fs.symlinkSync('missing-tree.json', path.join(danglingRoot, finalPath));
  assert.throws(() => atomicWriteTreeOutput(danglingRoot, finalPath, '{}\n'),
    /symbolic-link path component is forbidden/u);
});

test('derives only known JSON parity decision and review classifications', () => {
  const root = fixture();
  write(root, 'docs/config/documentation-parity/legacy.md.json', '{"status":"untriaged"}\n');
  write(root, 'docs/config/documentation-parity-reviews/legacy.md.json', '{"verdict":"PASS"}\n');
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
  const inventory = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/generated/inventory/documentation-tree.json'), 'utf8'));
  const records = inventory.files.filter((item) => item.path.includes('documentation-parity/legacy.md.json')
    || item.path.includes('documentation-parity-reviews/legacy.md.json'));
  assert.equal(records.length, 2);
  assert(records.every((item) => item.class === 'internal-documentation-input'));
});

test('rejects unknown and non-JSON files in derived parity roots', () => {
  const unknown = fixture();
  write(unknown, 'docs/config/documentation-parity/unknown.md.json', '{}\n');
  mustFail(unknown, 'does not belong to a classified legacy source');

  const nonJson = fixture();
  write(nonJson, 'docs/config/documentation-parity/legacy.md.yaml', 'status: untriaged\n');
  mustFail(nonJson, 'must be JSON files');
});

test('rejects a symlink in a derived parity input root', () => {
  const root = fixture();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tree-outside-')), 'decision.json');
  fs.writeFileSync(outside, '{}\n');
  const target = path.join(root, 'docs/config/documentation-parity/legacy.md.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(outside, target);
  mustFail(root, 'documentation paths may not contain symlinks');
});

test('does not let the derived parity rule classify adjacent paths', () => {
  const root = fixture();
  write(root, 'docs/config/documentation-parity-notes/legacy.md.json', '{}\n');
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

test('does not embed generated parity provenance as consumer edges', () => {
  const root = fixture({ parityProvenance: true });
  const inventory = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/generated/inventory/documentation-tree.json'), 'utf8'));
  const legacy = inventory.files.find((item) => item.path === 'docs/_legacy-source/legacy.md');
  assert(!legacy.consumers.some((item) => item.sourcePath
    === 'docs/generated/inventory/documentation-parity-units.jsonl'));
});

test('finds an untracked executable consumer', () => {
  const root = fixture();
  write(root, 'tests/untracked-check.mjs',
    "import fs from 'node:fs'; fs.readFileSync('docs/_legacy-source/legacy.md');\n");
  mustFail(root, 'an executable source consumes this file');
});

test('finds a computed legacy path in executable code', () => {
  const root = fixture();
  write(root, 'tests/computed-check.mjs',
    "import fs from 'node:fs'; fs.readFileSync(['docs', '_legacy-source', 'legacy.md'].join('/'));\n");
  mustFail(root, 'an executable source consumes this file');
});

test('finds a path.join-composed legacy path in executable code', () => {
  const root = fixture();
  write(root, 'tests/computed-path-check.mjs',
    "import fs from 'node:fs'; import path from 'node:path'; fs.readFileSync(path.join('docs', '_legacy-source', 'legacy.md'));\n");
  mustFail(root, 'an executable source consumes this file');
});

test('rejects canonical documentation read through a precomputed path.join variable', () => {
  const root = fixture();
  write(root, 'tests/precomputed-site-path.mjs', [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "const readerPage = path.join(",
    "  'docs', 'site', 'README.md',",
    ');',
    'fs.readFileSync(readerPage);',
    '',
  ].join('\n'));
  mustFail(root, 'canonical reader documentation cannot be an executable input');
});

test('rejects canonical documentation read through a precomputed new URL variable', () => {
  const root = fixture();
  write(root, 'tests/precomputed-site-url.mjs', [
    "import fs from 'node:fs';",
    "let readerPage = new URL('../docs/site/README.md', import.meta.url);",
    'await fs.promises.readFile(readerPage);',
    '',
  ].join('\n'));
  mustFail(root, 'canonical reader documentation cannot be an executable input');
});

test('rejects simple literal, array, concatenated, and template path variables used as file inputs', () => {
  for (const [name, declaration] of [
    ['literal', "const readerPage = 'docs/site/README.md';"],
    ['array', "const readerPage = ['docs', 'site', 'README.md'].join('/');"],
    ['concatenated', "const readerPage = 'docs/' + 'site/' + 'README.md';"],
    ['template', 'const readerPage = `docs/site/README.md`;'],
  ]) {
    const root = fixture();
    write(root, `tests/precomputed-${name}.mjs`, [
      "import fs from 'node:fs';",
      declaration,
      'fs.readFileSync(readerPage);',
      '',
    ].join('\n'));
    mustFail(root, 'canonical reader documentation cannot be an executable input');
  }
});

test('rejects aliased readers, ASI declarations, recursive composition, and inline concatenation', () => {
  for (const [name, source] of [
    ['alias', "import fs from 'node:fs'; const load = fs.readFileSync; load('docs/site/README.md');\n"],
    ['import-alias', "import { readFileSync as load } from 'node:fs'; load('docs/site/README.md');\n"],
    ['destructured-alias', "import fs from 'node:fs'; const { readFileSync: load } = fs; load('docs/site/README.md');\n"],
    ['asi', "import fs from 'node:fs'\nconst readerPage = 'docs/site/README.md'\nfs.readFileSync(readerPage)\n"],
    ['recursive', "import fs from 'node:fs'; const folder='docs/site'; const readerPage=folder+'/README.md'; fs.readFileSync(readerPage);\n"],
    ['inline-concatenation', "import fs from 'node:fs'; fs.readFileSync('do' + 'cs/site/README.md');\n"],
    ['multi-declarator', "import fs from 'node:fs'; const folder='docs/site', page=folder+'/README.md'; fs.readFileSync(page);\n"],
    ['later-assignment', "import fs from 'node:fs'; let page; page='docs/site/README.md'; fs.readFileSync(page);\n"],
    ['template-interpolation', "import fs from 'node:fs'; const folder='docs/site'; const page=`${folder}/README.md`; fs.readFileSync(page);\n"],
    ['template-execution', "import fs from 'node:fs'; const data=`${fs.readFileSync('docs/site/README.md')}`;\n"],
    ['path-resolve', "import fs from 'node:fs'; import path from 'node:path'; const page=path.resolve('docs','site','README.md'); fs.readFileSync(page);\n"],
  ]) {
    const root = fixture();
    write(root, `tests/${name}-site-input.mjs`, source);
    mustFail(root, 'canonical reader documentation cannot be an executable input');
  }
});

test('does not treat an identifier mentioned only inside a file-name string as a variable input', () => {
  const root = fixture();
  write(root, 'tests/precomputed-name-string.mjs', [
    "import fs from 'node:fs';",
    "const readerPage = 'docs/site/README.md';",
    "fs.readFileSync('readerPage');",
    '',
  ].join('\n'));
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('does not treat a precomputed diagnostic documentation path as a runtime input', () => {
  const root = fixture();
  write(root, 'tests/precomputed-site-help.mjs', [
    "import path from 'node:path';",
    "var readerPage = path.join('docs', 'site', 'README.md');",
    "throw new Error(`See ${readerPage}`);",
    '',
  ].join('\n'));
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('rejects canonical documentation symlinks that escape the repository', () => {
  const root = fixture();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-canonical-outside-')), 'outside.md');
  fs.writeFileSync(outside, '# Outside\n');
  fs.symlinkSync(outside, path.join(root, 'docs/site/external.md'));
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.files.push({ path: 'docs/site/external.md', class: 'canonical-reader-documentation',
    purpose: 'canonical test page', originalPath: 'docs/site/external.md', expectedPath: 'docs/site/external.md',
    introducedAfterBaseline: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'documentation paths may not contain symlinks');
});

test('treats GitHub workflow YAML as executable configuration', () => {
  const root = fixture();
  write(root, '.github/workflows/legacy-input.yml',
    'name: legacy\njobs:\n  check:\n    env:\n      DOC_INPUT: docs/_legacy-source/legacy.md\n');
  mustFail(root, 'an executable source consumes this file');
});

test('treats deployment and runtime YAML roots as executable configuration', () => {
  for (const directory of ['deploy', 'docker', 'my-values', 'skills/example']) {
    const root = fixture();
    write(root, `${directory}/legacy-input.yaml`, 'input: docs/_legacy-source/legacy.md\n');
    mustFail(root, 'an executable source consumes this file');
  }
});

test('supports a real SHA-256 Git repository tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-doc-tree-sha256-'));
  write(root, 'scripts/docs-tree-boundary.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/docs-tree-boundary.mjs'), 'utf8'));
  write(root, 'docs/site/README.md', '# Canonical\n');
  run(root, 'git', ['init', '-q', '--object-format=sha256']);
  run(root, 'git', ['config', 'user.name', 'Docs Test']);
  run(root, 'git', ['config', 'user.email', 'docs-test@example.invalid']);
  run(root, 'git', ['add', '.']);
  run(root, 'git', ['commit', '-qm', 'baseline']);
  const revision = run(root, 'git', ['rev-parse', 'HEAD'], { capture: true }).trim();
  assert.match(revision, /^[0-9a-f]{64}$/u);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', `--capture-baseline=${revision}`]);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--bootstrap-classification']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('rejects canonical reader documentation used as an executable input', () => {
  const root = fixture();
  write(root, 'tests/site-input.mjs',
    "import fs from 'node:fs'; fs.readFileSync('docs/site/README.md');\n");
  mustFail(root, 'canonical reader documentation cannot be an executable input');
});

test('rejects canonical documentation read through a nested new URL call', () => {
  const root = fixture();
  write(root, 'tests/site-url-input.mjs',
    "import fs from 'node:fs'; fs.readFileSync(new URL('../docs/site/README.md', import.meta.url));\n");
  mustFail(root, 'canonical reader documentation cannot be an executable input');
});

test('does not mistake a later diagnostic link for an earlier completed file read', () => {
  const root = fixture();
  write(root, 'scripts/runtime-help.mjs',
    "import fs from 'node:fs'; fs.readFileSync('package.json'); throw new Error('See docs/site/README.md');\n");
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('allows documentation tooling to validate canonical reader documentation', () => {
  const root = fixture();
  write(root, 'scripts/docs-publication.mjs',
    "import fs from 'node:fs'; fs.readFileSync('docs/site/README.md');\n");
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('allows runtime diagnostics to point readers to canonical documentation', () => {
  const root = fixture();
  write(root, 'scripts/runtime-help.mjs',
    "throw new Error('See docs/site/README.md for recovery.');\n");
  run(root, 'node', ['scripts/docs-tree-boundary.mjs']);
  run(root, 'node', ['scripts/docs-tree-boundary.mjs', '--check']);
});

test('follows executable dependencies through ordinary config documents', () => {
  const root = fixture();
  write(root, 'docs/config/runtime-input.json', '{"legacy":"docs/legacy.md"}\n');
  write(root, 'tests/config-check.mjs',
    "import fs from 'node:fs'; fs.readFileSync('docs/config/runtime-input.json');\n");
  const registryPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.files.push({ path: 'docs/config/runtime-input.json', class: 'internal-documentation-input',
    purpose: 'fixture configuration authority', originalPath: 'docs/config/runtime-input.json',
    expectedPath: 'docs/config/runtime-input.json', introducedAfterBaseline: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  mustFail(root, 'through a documentation dependency');
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
