import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { bindPublicationExampleCoverage, publicationExampleProse } from '../lib/docs-publication-example-coverage.mjs';
import { validateSdkLiteralExamples, validateCanonicalSdkProgram } from '../docs-publication-sdk-examples.mjs';
import { validateWaitTemplate, validateProjectFactories } from '../docs-publication-example-native.mjs';

test('prompt library workspace commands retain real receiver and old verification bytes through the native syntax owner', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const { validateInstructionSyntax } = await import('../docs-publication-instruction-syntax.mjs');
  const declaration = JSON.parse(fs.readFileSync(path.join(root, 'docs/config/publication-example-claims.json'), 'utf8'));
  const pages = declaration.pages.map(item => item.path);
  const sources = new Map(pages.map(page => [page, fs.readFileSync(path.join(root, page), 'utf8')]));
  const result = validateInstructionSyntax(pages, sources);
  assert.equal(result.documentCommandsExecuted, false);
  assert.equal(result.checkedCommandReferences.length, 451);
  for (const ordinal of [1, 2]) assert.ok(result.checkedCommandReferences.includes(`docs/site/extend/contracts.md#block-${ordinal}`));
  const page = 'docs/site/extend/contracts.md', text = sources.get(page);
  // Syntactically valid mutations keep both fences and the total count. The
  // actual native receiver, not a test-local field assertion, must reject them.
  for (const changed of [text.replace('npm test --workspace @kubeclaw/prompt-contract', 'npm test --workspace @kubeclaw/unrelated-contract'),
    text.replace('npm test --workspace @kubeclaw/prompt-contract\n', ''),
    text.replace('check-plugin-system-v2-contracts.mjs', 'check-unrelated-contract.mjs')]) {
    assert.notEqual(changed, text);
    const bad = new Map(sources); bad.set(page, changed);
    assert.throws(() => validateInstructionSyntax(pages, bad), /prompt library workspace commands changed|existing five-registration verification body changed/u);
  }
  assert.equal(validateInstructionSyntax(pages, sources).checkedCommandReferences.length, 451);
});

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-example-claims-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const name = 'docs/site/use/example.md', file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = '# Example\n\nRun only in the owned fixture.\n\n```json\n{"ready":true}\n```\n';
  fs.writeFileSync(file, text);
  const duty = { owner: 'fixture owner', claim: 'Complete documented fixture input',
    executionBoundary: 'No actual external service execution', basis: 'Explicit test fixture, not product acceptance', checks: ['fixture-input'] };
  const declaration = { schemaVersion: 'kubeclaw-publication-example-claims.v1',
    pages: [{ path: name, sha256: hash(text), ...duty,
      prose: publicationExampleProse(text).map(({ ordinal, sha256 }) => ({ ordinal, sha256, ...duty })),
      blocks: [{ ordinal: 1, type: 'fence', info: 'json',
      sha256: hash('{"ready":true}\n'), ...duty, role: 'native-input' }] }], assets: [], authorities: [], contracts: [],
    checks: [{ id: 'fixture-input', validator: 'fixture-native-owner',
      inputs: [name, `${name}#block-1`, ...publicationExampleProse(text).map(item => `${name}#prose-${item.ordinal}`)],
      claim: 'Validate actual fixture input', limit: 'Not a production service' }] };
  return { root, file, text, declaration, bind: () => bindPublicationExampleCoverage(root, [file], [], declaration) };
}

test('new inline/prose instructions cannot inherit a prior code-only classification', t => {
  const f = fixture(t);
  assert.equal(f.bind().checks.length, 1);
  fs.appendFileSync(f.file, '\nRun this additional production command.\n');
  assert.throws(f.bind, /inline\/prose example claims changed/u);
});

test('refreshing the whole-page hash cannot admit new plain or inline instructions', t => {
  const f = fixture(t);
  for (const addition of ['\nRun this additional production command.\n', '\nRun `new-unsafe-command` now.\n']) {
    fs.writeFileSync(f.file, f.text + addition);
    f.declaration.pages[0].sha256 = hash(fs.readFileSync(f.file));
    assert.throws(f.bind, /inline\/prose region/u);
  }
  fs.writeFileSync(f.file, f.text);
  f.declaration.pages[0].sha256 = hash(f.text);
  assert.equal(f.bind().checks.length, 1);
});

test('a recorded prose region cannot be exempted or attached to an unrelated action', t => {
  const f = fixture(t);
  f.declaration.pages[0].prose[0].checks = [];
  assert.throws(f.bind, /missing check assignment/u);
  f.declaration.pages[0].prose[0].checks = ['fixture-input'];
  f.declaration.checks[0].inputs = f.declaration.checks[0].inputs.filter(input => input !== 'docs/site/use/example.md#prose-1');
  assert.throws(f.bind, /no assigned check consumes/u);
});

test('refreshing a page hash alone cannot admit changed or additional code', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, f.text.replace('true', 'false'));
  f.declaration.pages[0].sha256 = hash(fs.readFileSync(f.file));
  assert.throws(f.bind, /block 1: sha256 changed/u);
  fs.writeFileSync(f.file, `${f.text}\n    unknown executable input\n`);
  f.declaration.pages[0].sha256 = hash(fs.readFileSync(f.file));
  assert.throws(f.bind, /unclassified publication example block/u);
});

test('claims cannot reference missing native owners or silently omit selected assets', t => {
  const f = fixture(t);
  f.declaration.pages[0].checks = ['invented'];
  assert.throws(f.bind, /unknown native\/fidelity check/u);
  f.declaration.pages[0].checks = ['fixture-input'];
  assert.throws(() => bindPublicationExampleCoverage(f.root, [f.file], ['use/example.json'], f.declaration),
    /unclassified publication example asset/u);
});

test('source authority symlinks cannot reuse repository-local hash declarations', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'outside.json'), '{}');
  fs.symlinkSync(path.join(f.root, 'outside.json'), path.join(f.root, 'link.json'));
  f.declaration.authorities.push({ path: 'link.json', sha256: hash('{}'), responsibility: 'native source binding' });
  assert.throws(f.bind, /authority symlink/u);
});

const sdkMarkdown = fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/site/reference/sdk-exports.md'), 'utf8');
test('actual SDK governed values reach native schemas, including field domains', () => {
  const rows = validateSdkLiteralExamples(sdkMarkdown);
  assert.equal(rows.length, 58);
  assert(rows.some(row => row.nativeValidation === 'field-domain-only'));
});

test('invalid SDK attempt identity is rejected by its actual native contract', () => {
  assert.throws(() => validateSdkLiteralExamples(sdkMarkdown.replace('attemptNumber:1};', 'attemptNumber:0};')),
    error => error.code === 'REGISTRY_RESULT_INVALID');
});

test('a source-only SDK literal is never evaluated as arbitrary JavaScript', () => {
  assert.throws(() => validateSdkLiteralExamples(sdkMarkdown.replace("'adapter:example.adapter:main';", "process.exit(0);")),
    /SDK_EXAMPLE_NONLITERAL_EXPRESSION:CallExpression/u);
});

test('an altered canonical SDK program is refused before any scratch or execution', () => {
  assert.throws(() => validateCanonicalSdkProgram('/not-an-execution-directory', 'process.exit(0);'),
    /canonical SDK program changed/u);
});

test('wait example discovery respects declared trust separately from installation', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const directory = path.join(root, 'docs/site/use/workflows/wait-resume');
  const platform = JSON.parse(fs.readFileSync(path.join(directory, 'platform.template.json'), 'utf8'));
  const definition = JSON.parse(fs.readFileSync(path.join(directory, 'approval.pipeline.json'), 'utf8'));
  const projection = { providers: platform.providers, grants: platform.grants };
  assert.equal(validateWaitTemplate(root, platform, definition, projection).activation, false);
  const untrusted = structuredClone(platform);
  untrusted.trustedBuiltinRoots = [path.join(root, 'skills/buster/plugins')];
  assert.throws(() => validateWaitTemplate(root, untrusted, definition, projection),
    error => error.code === 'REGISTRY_PACKAGE_UNTRUSTED');
  assert.equal(validateWaitTemplate(root, platform, definition, projection).nativeSchemaGraphConfigurationAndGrants, true);
});

test('authored procedure duties and truthful native-result linkage fail closed', async () => {
  const { validatePublicationClaimContracts } = await import('../lib/docs-publication-claim-contracts.mjs');
  const sourceRef = 'docs/site/use/contract.md';
  const sources = new Map([[sourceRef, 'Use the private fixture. Stop on error. Remove only owned files.\n']]);
  const contract = { sourceRef, kind: 'bounded-procedure', scope: 'Private fixture lifecycle',
    owners: ['fixture owner'], prerequisites: 'Owned fixture only', expectedResults: 'Actual bounded result',
    errors: 'Stop on native error', effects: 'Private local files', cleanup: 'Remove only owned files',
    limits: 'No production or historical execution claim', nativeChecks: ['fixture-native'],
    execution: { mode: 'source-procedure-contract', productionExecution: false,
      historicalExecutionReused: false, nativeAssertions: 'separate-dispatched-results',
      statement: 'The procedure remains unexecuted; native results are separate.' },
    anchors: [{ ref: sourceRef, exactExcerpt: sources.get(sourceRef), occurrences: 1 }] };
  const declaration = { pages: [{ path: sourceRef }], assets: [], contracts: [contract],
    checks: [{ id: 'fixture-native', inputs: [sourceRef] }] };
  const results = [{ id: 'fixture-native', result: { nativeFixture: true } }];
  const validate = () => validatePublicationClaimContracts(declaration, sources, results);
  assert.equal(validate().actualNativeResultsJoined, true);
  delete contract.cleanup;
  assert.throws(validate, /cleanup/u);
  contract.cleanup = 'Remove only owned files';
  contract.execution.productionExecution = true;
  assert.throws(validate);
  contract.execution.productionExecution = false;
  declaration.checks[0].inputs = ['unrelated-source'];
  assert.throws(validate, /does not consume/u);
  declaration.checks[0].inputs = [sourceRef];
  contract.anchors[0].exactExcerpt = 'A removed stop condition';
  assert.throws(validate, /source statement changed/u);
  contract.anchors[0].exactExcerpt = sources.get(sourceRef);
  assert.throws(() => validatePublicationClaimContracts(declaration, sources, []), /missing actual/u);
  assert.equal(validate().authoredScopes, 1);
});


test('actual project factories ignore caller Git templates, hooks and executable path', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-poisoned-git-'));
  const original = { ...process.env };
  try {
    const home = path.join(temporary, 'home'), bin = path.join(temporary, 'bin');
    const template = path.join(temporary, 'template'), hooks = path.join(template, 'hooks');
    for (const directory of [home, bin, hooks]) fs.mkdirSync(directory, { recursive: true });
    const pathMarker = path.join(temporary, 'path-marker'), hookMarker = path.join(temporary, 'hook-marker');
    fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nprintf exercised > '${pathMarker}'\nexit 97\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(hooks, 'pre-commit'), `#!/bin/sh\nprintf exercised > '${hookMarker}'\nexit 98\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(home, '.gitconfig'), `[init]\n templateDir = ${template}\n[core]\n hooksPath = ${hooks}\n`);
    Object.assign(process.env, { HOME: home, PATH: `${bin}:${original.PATH}`,
      GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_SYSTEM: path.join(home, '.gitconfig'),
      GIT_TEMPLATE_DIR: template, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks });
    const result = validateProjectFactories(path.resolve(import.meta.dirname, '../..'));
    assert.equal(result.length, 2);
    assert(result.every(item => item.privateGitConfiguration && item.stages.length === 8));
    assert.equal(fs.existsSync(pathMarker), false);
    assert.equal(fs.existsSync(hookMarker), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('workflow examples use the real readonly inventory and exact native table/pipeline projection', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const files = ['deploy-script', 'secret-setup', 'helm-values', 'workflows']
    .map(name => path.join(root, 'docs/generated/inventory', `${name}.json`));
  const before = files.map(file => hash(fs.readFileSync(file)));
  const { buildWorkflowInventory } = await import('../docs-inventory.mjs');
  const { renderWorkflowTable, generatedNotice } = await import('../docs-generate-core.mjs');
  const { renderProductPipeline } = await import('../docs-product-pipeline-reference.mjs');
  const { validateWorkflowProjection } = await import('../docs-publication-example-projections.mjs');
  const inventory = buildWorkflowInventory();
  assert.deepEqual(files.map(file => hash(fs.readFileSync(file))), before);
  const fixture = `${generatedNotice(inventory.generatedFrom)}\n## Workflows\n\n${renderWorkflowTable(inventory)}\n${renderProductPipeline(root)}\n\n## Product pipeline source revision\n`;
  assert.equal(validateWorkflowProjection(root, fixture).workflowJobsExecuted, false);
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-unrelated-cwd-'));
  try {
    // Import inside a fresh process: importing in this parent first would capture
    // the correct repository CWD and fail to exercise the original bug.
    const program = `
      import assert from 'node:assert/strict';
      const {buildWorkflowInventory} = await import(${JSON.stringify(new URL('../docs-inventory.mjs', import.meta.url).href)});
      const {validateWorkflowProjection} = await import(${JSON.stringify(new URL('../docs-publication-example-projections.mjs', import.meta.url).href)});
      const root = ${JSON.stringify(root)};
      const expected = ${JSON.stringify(inventory)};
      const fixture = ${JSON.stringify(fixture)};
      assert.notEqual(process.cwd(), root);
      assert.deepEqual(buildWorkflowInventory(root), expected);
      assert.equal(validateWorkflowProjection(root, fixture).workflowJobsExecuted, false);
      console.log(JSON.stringify({freshImportFromUnrelatedCwd: true}));
    `;
    const output = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-'], {
      cwd: unrelated, input: program, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: unrelated, LANG: 'C.UTF-8', TZ: 'UTC' },
    }));
    assert.equal(output.freshImportFromUnrelatedCwd, true);
  } finally { fs.rmSync(unrelated, { recursive: true, force: true }); }
  assert.throws(() => validateWorkflowProjection(root, fixture.replace(
    'Native documentation retention query', 'Invented unrelated workflow')), /native renderer/u);
  assert.throws(() => validateWorkflowProjection(root, fixture.replace(
    '\n## Product pipeline source revision', '\n| unowned extra row |\n## Product pipeline source revision')), /native renderer/u);
  assert.equal(validateWorkflowProjection(root, fixture).nativeWorkflowInventoryTableAndProductPipelineProjection, true);
});
