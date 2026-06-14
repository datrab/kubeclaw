import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'runtime/check-nova-startup-smoke' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') {
      args.sourceRoot = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      KUBECLAW_DISABLE_DISCORD_WEBHOOKS: '1',
      ...options.env,
    },
    encoding: 'utf8',
    timeout: options.timeout ?? 10000,
  });
}

const { sourceRoot } = parseArgs();
const novaEntrypoint = path.join(sourceRoot, 'skills/nova/pipeline.ts');
const novaIndex = path.join(sourceRoot, 'skills/nova/pipeline/index.ts');
const novaCli = path.join(sourceRoot, 'skills/nova/pipeline/cli.ts');
const novaCliShim = path.join(sourceRoot, 'skills/nova/pipeline/cli.ts');
const configSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core/config.ts'), 'utf8');
const deploymentSource = fs.readFileSync(path.join(sourceRoot, 'charts/kubeclaw/templates/deployment.yaml'), 'utf8');

for (const entrypoint of [novaEntrypoint, novaIndex, novaCliShim, novaCli]) {
  const syntax = runNode(['--check', entrypoint], { cwd: sourceRoot });
  assert.equal(
    syntax.status,
    0,
    `${path.relative(sourceRoot, entrypoint)} should parse cleanly\nstdout:\n${syntax.stdout}\nstderr:\n${syntax.stderr}`,
  );
}

const publicApi = await import(pathToFileURL(novaEntrypoint).href);
for (const [name, type] of [
  ['loadConfig', 'function'],
  ['runPipeline', 'function'],
  ['registerShutdownHooks', 'function'],
  ['EXIT_OK', 'number'],
  ['EXIT_ERROR', 'number'],
  ['EXIT_NEEDS_NOVA', 'number'],
  ['EXIT_BLOCKED', 'number'],
  ['EXIT_TIMEOUT', 'number'],
  ['EXIT_RATE_LIMITED', 'number'],
]) {
  assert.equal(typeof publicApi[name], type, `Nova public entrypoint should export ${name} as ${type}`);
}

const cliApi = await import(pathToFileURL(novaCliShim).href);
assert.equal(typeof cliApi.main, 'function', 'Nova CLI module should export main()');
assert.equal(configSource.includes('process.env.DISCORD_WEBHOOK'), false, 'Nova loadConfig must not synthesize discord_webhook_url from deployment env');
assert.equal(configSource.includes('progress.pipeline_review'), false, 'Nova loadConfig must not mirror progress.pipeline_review into runtime config');
assert.equal(deploymentSource.includes('swarm.config.json written from chart source'), true, 'Helm deployment must overwrite persisted swarm.config.json from chart source');
assert.equal(deploymentSource.includes('delete config.discord_webhook_url'), true, 'Helm deployment must remove discord_webhook_url from persistent swarm.config.json source');
assert.equal(deploymentSource.includes('config.discord_webhook_url=process.env.DISCORD_WEBHOOK'), true, 'Helm deployment must render DISCORD_WEBHOOK only into runtime swarm.config.json');

const policyApi = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/core/policy.ts')).href);
assert.equal(
  policyApi.VALID_THINKING_LEVELS.includes('adaptive'),
  true,
  'Nova policy should expose adaptive as an accepted runtime thinking level',
);

for (const { args, error } of [
  { args: ['--unknown-flag', '1'], error: 'Unknown flag: --unknown-flag' },
  { args: ['--prompt-file'], error: 'Missing value for --prompt-file' },
]) {
  const invalidArgv = runNode([novaEntrypoint, ...args], { cwd: sourceRoot });
  assert.equal(
    invalidArgv.status,
    publicApi.EXIT_ERROR,
    `nova ${args.join(' ')} should exit EXIT_ERROR\nstdout:\n${invalidArgv.stdout}\nstderr:\n${invalidArgv.stderr}`,
  );
  assert.deepEqual(
    JSON.parse(invalidArgv.stdout),
    { exit: publicApi.EXIT_ERROR, error },
    `nova ${args.join(' ')} should emit structured CLI error JSON`,
  );
  assert.equal(
    invalidArgv.stderr.includes(`[ERROR] ${error}`),
    true,
    `nova ${args.join(' ')} should log a concise parser error`,
  );
  assert.equal(
    /\n\s+at\s/.test(invalidArgv.stderr),
    false,
    `nova ${args.join(' ')} should not print a Node stack trace`,
  );
}

const help = runNode([novaEntrypoint, '--help'], { cwd: sourceRoot });
assert.equal(
  help.status,
  0,
  `nova --help should exit 0\nstdout:\n${help.stdout}\nstderr:\n${help.stderr}`,
);
const helpText = `${help.stdout}\n${help.stderr}`;
for (const marker of [
  'KubeClaw Swarm Pipeline',
  '--project <n>',
  '--resume',
  '--status',
  `Runtime thinking override: ${policyApi.VALID_THINKING_LEVELS.join('|')}`,
  'Exit codes:',
]) {
  assert.equal(helpText.includes(marker), true, `nova --help should include ${marker}`);
}

quietConsole.restore();
console.log('Nova startup smoke passed');
