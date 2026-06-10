import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-strict-cli-args-surface' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const parserPath = path.join(sourceRoot, 'skills/common/pipeline/cli-args.ts');
const { parseCliArgs, parseCliFlagValues } = await import(pathToFileURL(parserPath).href);
const novaCliPath = path.join(sourceRoot, 'skills/nova/pipeline/cli.ts');
const { normalizeNovaCliFlags } = await import(pathToFileURL(novaCliPath).href);
const lintReportCliPath = path.join(sourceRoot, 'skills/nova/pipeline/tools/lint-report.ts');
const lintReportReportPath = path.join(sourceRoot, 'skills/nova/pipeline/tools/lint-report/report.ts');
const { lintReportExitCode } = await import(pathToFileURL(lintReportCliPath).href);
const { runAllTools: runLintReportTools } = await import(pathToFileURL(lintReportReportPath).href);

assert.deepEqual(
  parseCliArgs(['--name', 'demo', '--json', 'pos'], {
    allowPositionals: true,
    flags: { name: { type: 'string' }, json: { type: 'boolean', default: false } },
  }),
  { values: { json: true, name: 'demo' }, positionals: ['pos'] },
  'parser should support declared string flags, booleans, defaults, and positionals'
);

assert.deepEqual(
  parseCliFlagValues(['--name=demo', '--json=false'], {
    flags: { name: { type: 'string' }, json: { type: 'boolean', default: true } },
  }),
  { json: false, name: 'demo' },
  'parser should support --flag=value syntax'
);

assert.throws(() => parseCliArgs(['--oops'], { flags: {} }), /Unknown flag: --oops/);
assert.throws(() => parseCliArgs(['--name'], { flags: { name: { type: 'string' } } }), /Missing value for --name/);
assert.throws(() => parseCliArgs(['pos'], { flags: {} }), /Unexpected positional argument/);
assert.throws(() => parseCliArgs([], { flags: { project: { type: 'string', required: true } } }), /Missing required flag: --project/);

const normalizedNovaFlags = normalizeNovaCliFlags({
  project: 'cli-project',
  repo: '/repo',
  module: 'api',
  blueprint: 'ui',
  'blueprint-list': true,
  prompt: 'fix it',
  'prompt-file': 'prompts/fix.md',
  'nova-channel': 'cli-channel',
  model: 'gpt-test',
  thinking: 'adaptive',
  resume: true,
  status: false,
  'dry-run': true,
  help: false,
}, { CURRENT_PROJECT: 'env-project', NOVA_CHANNEL: 'env-channel' });
assert.equal(Object.isFrozen(normalizedNovaFlags), true, 'normalized Nova flags should be frozen');
assert.deepEqual(
  Object.keys(normalizedNovaFlags).sort(),
  [
    'blueprint',
    'blueprintList',
    'dryRun',
    'help',
    'module',
    'novaChannel',
    'project',
    'prompt',
    'promptFile',
    'repo',
    'resume',
    'runtimeModel',
    'runtimeThinking',
    'status',
  ].sort(),
  'normalized Nova flags should expose only canonical camelCase keys',
);
assert.equal(normalizedNovaFlags.project, 'cli-project', 'CLI project should override env fallback');
assert.equal(normalizedNovaFlags.novaChannel, 'cli-channel', 'CLI nova channel should override env fallback');
assert.equal(normalizedNovaFlags.blueprintList, true);
assert.equal(normalizedNovaFlags.promptFile, 'prompts/fix.md');
assert.equal(normalizedNovaFlags.runtimeModel, 'gpt-test');
assert.equal(normalizedNovaFlags.runtimeThinking, 'adaptive');
assert.equal(normalizedNovaFlags.dryRun, true);
assert.throws(() => { normalizedNovaFlags.dryRun = false; }, /TypeError|read only|extensible|object/i, 'normalized Nova flags should reject mutation');
for (const legacyKey of ['blueprint-list', 'prompt-file', 'nova-channel', 'dry-run', 'model', 'thinking']) {
  assert.equal(normalizedNovaFlags[legacyKey], undefined, `legacy Nova flag key ${legacyKey} should stay absent from the canonical flag object`);
}
const envFallbackNovaFlags = normalizeNovaCliFlags({ resume: false, status: false, help: false }, {
  CURRENT_PROJECT: 'env-project',
  NOVA_CHANNEL: 'env-channel',
});
assert.equal(envFallbackNovaFlags.project, 'env-project', 'project should use env fallback when CLI value is absent');
assert.equal(envFallbackNovaFlags.novaChannel, 'env-channel', 'novaChannel should use env fallback when CLI value is absent');

assert.equal(lintReportExitCode({ summary: { total_errors: 0, tools_failed: 0 } }), 0, 'clean lint reports should exit 0');
assert.equal(lintReportExitCode({ summary: { total_errors: 1, tools_failed: 0 } }), 1, 'lint findings should exit 1');

const throwingLintReport = await runLintReportTools({
  repoRoot: sourceRoot,
  project: 'strict-cli-lint-tool-failure',
  tier: 'pre-check',
  changedFiles: [],
  projectTypes: new Set(['javascript']),
}, [{
  id: 'throwing-tool',
  name: 'Throwing Tool',
  binary: 'node',
  tier: 'pre-check',
  detect: () => true,
  run: () => { throw new Error('synthetic tool failure'); },
}]);
assert.equal(throwingLintReport.summary.total_errors, 0, 'synthetic tool failure should not create findings');
assert.equal(throwingLintReport.summary.tools_failed, 1, 'synthetic tool failure should be counted in report summary');
assert.equal(lintReportExitCode(throwingLintReport), 1, 'lint-report CLI should fail when tools_failed is nonzero without findings');

const migratedCliFiles = [
  'skills/nova/pipeline/cli.ts',
  'skills/nova/pipeline/tools/redis.ts',
  'skills/nova/pipeline/tools/project-summary.ts',
  'skills/nova/pipeline/tools/lint-report.ts',
  'skills/buster/pipeline/tools/redis.ts',
  'skills/buster/pipeline/tools/verify-task.ts',
  'skills/buster/pipeline/tools/visual-audit.ts',
  'skills/buster/pipeline/tools/screenshot.ts',
];
for (const relativePath of migratedCliFiles) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
  assert.equal(source.includes('parseCliArgs') || source.includes('parseCliFlagValues'), true, `${relativePath} should use the shared strict CLI parser`);
  assert.equal(/args\.indexOf\(['"`]--/.test(source), false, `${relativePath} should not keep manual args.indexOf('--...') parsing`);
}
const novaCliSource = fs.readFileSync(novaCliPath, 'utf8');
assert.equal(/\bflags\[['"`](blueprint-list|prompt-file|nova-channel|dry-run)['"`]\]/.test(novaCliSource), false, 'Nova CLI runtime should not read deleted dashed flag keys');
assert.equal(/\bflags\.(model|thinking)\b/.test(novaCliSource), false, 'Nova CLI runtime should not read raw model/thinking flag keys');
assert.equal(['config.ts', 'context.ts', 'policy.ts'].some((file) => fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core', file), 'utf8').includes('_runtimeOverrides')), false, 'runtime model/thinking overrides must be PipelineContext-only, not config mirrors');

const busterRedisUnknownFlag = spawnSync(process.execPath, [
  path.join(sourceRoot, 'skills/buster/pipeline/tools/redis.ts'),
  '--action', 'send',
  '--unknown-flag', '1',
], { encoding: 'utf8' });
assert.notEqual(busterRedisUnknownFlag.status, 0, 'Buster Redis direct CLI should reject unknown flags');
assert.match(
  busterRedisUnknownFlag.stderr,
  /Unknown flag: --unknown-flag/,
  'Buster Redis direct CLI should fail through strict parser instead of missing parseCliFlagValues import',
);
assert.equal(
  busterRedisUnknownFlag.stderr.includes('parseCliFlagValues is not defined'),
  false,
  'Buster Redis direct CLI must import parseCliFlagValues',
);

const lintScopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-cli-lint-scope-'));
try {
  const repoRoot = path.join(lintScopeRoot, 'repo');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'existing.js'), 'export const ok = true;\n');
  const outputPath = path.join(lintScopeRoot, 'lint-report.json');
  execFileSync(process.execPath, [
    path.join(sourceRoot, 'skills/nova/pipeline/tools/lint-report.ts'),
    '--repo', repoRoot,
    '--tier', 'pre-check',
    '--changed-files', 'existing.js,deleted.js',
    '--output', outputPath,
  ], { encoding: 'utf8' });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(report.changed_files, ['existing.js'], 'lint-report CLI should apply existing-file changed scope before running/reporting tools');
} finally {
  fs.rmSync(lintScopeRoot, { recursive: true, force: true });
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 36 }));
