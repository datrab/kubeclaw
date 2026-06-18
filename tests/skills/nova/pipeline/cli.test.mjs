import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeNovaCliFlags } from '../../../../skills/nova/pipeline/cli.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entrypoint = path.resolve(__dirname, '../../../../skills/nova/pipeline.ts');

test('CLI parse errors emit complete JSON before exiting', () => {
  for (let i = 0; i < 10; i += 1) {
    const child = spawnSync(process.execPath, [entrypoint, '--definitely-bad-flag'], {
      encoding: 'utf8',
    });

    assert.equal(child.status, 1);
    assert.match(child.stderr, /Unknown flag: --definitely-bad-flag/);
    assert.deepEqual(JSON.parse(child.stdout), {
      exit: 1,
      error: 'Unknown flag: --definitely-bad-flag',
    });
  }
});

test('normalizeNovaCliFlags uses REPO_ROOT when --repo is omitted', () => {
  const flags = normalizeNovaCliFlags({}, { REPO_ROOT: '/tmp/repo' });

  assert.equal(flags.repo, '/tmp/repo');
});

test('normalizeNovaCliFlags prefers --repo over REPO_ROOT', () => {
  const flags = normalizeNovaCliFlags({ repo: '/tmp/explicit' }, { REPO_ROOT: '/tmp/repo' });

  assert.equal(flags.repo, '/tmp/explicit');
});

test('successful CLI runs clear the active logging context', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-cli-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const loaderPath = path.join(root, 'mock-cli-loader.mjs');
  fs.writeFileSync(loaderPath, `
const sources = new Map([
  ['mock:shutdown', "export function registerShutdownHooks() {}"],
  ['mock:config', "export function loadConfig() { return { config: { project: 'demo', repo_root: '/repo', paths: {} }, progress: { modules: {}, gates: {}, execution_order: [] }, pluginRegistry: {} }; }"],
  ['mock:blueprint', "export function listBlueprints() { return []; } export async function releaseBlueprint() { return { status: 'success' }; }"],
  ['mock:context', "export function createPipelineContext(init) { return { ...init, setTempDir(dir) { this._tmpDir = dir; return this; } }; }"],
  ['mock:logger', "globalThis.__activeLogContext = globalThis.__activeLogContext || null; export function log() {} export function initContextLogging() {} export function setActiveContext(ctx) { globalThis.__activeLogContext = ctx; } export function clearActiveContext() { globalThis.__activeLogContext = null; } export function getActiveContext() { return globalThis.__activeLogContext; }"],
  ['mock:temp', "export function createTempManager() { return { dir: null, init() { this.dir = '/tmp/nova-cli-test'; }, cleanup() {} }; }"],
  ['mock:status', "globalThis.__initLogDirCalls = 0; export function initLogDir() { globalThis.__initLogDirCalls += 1; } export async function closeLogDir() {} export function getInitLogDirCalls() { return globalThis.__initLogDirCalls; }"],
  ['mock:runtime', "export function createRunId() { return 'run-test'; } export function createRunStats() { return { errors: [] }; }"],
  ['mock:runner', "export async function runPipeline() { return 0; } export function printStatus() {} export function dryRun() {}"],
  ['mock:policy', "export const VALID_THINKING_LEVELS = ['low']; export function validateThinkingLevel() {}"],
  ['mock:prompt', "export const PROMPT_INGRESS_MAX_BYTES = 1024; export function resolveNovaPromptIngress() { return { prompt: null, metadata: null }; }"],
]);
const mocks = new Map([
  ['./agents/shutdown.ts', 'mock:shutdown'],
  ['./core/config.ts', 'mock:config'],
  ['./services/blueprint.ts', 'mock:blueprint'],
  ['./core/context.ts', 'mock:context'],
  ['./core/logger.ts', 'mock:logger'],
  ['./core/temp.ts', 'mock:temp'],
  ['./services/status-store.ts', 'mock:status'],
  ['./core/runtime.ts', 'mock:runtime'],
  ['./runners/pipeline-runner.ts', 'mock:runner'],
  ['./core/policy.ts', 'mock:policy'],
  ['./services/prompt-ingress.ts', 'mock:prompt'],
]);
export async function resolve(specifier, context, nextResolve) {
  if (mocks.has(specifier)) return { url: mocks.get(specifier), shortCircuit: true };
  if (specifier.endsWith('/core/logger.ts')) return { url: 'mock:logger', shortCircuit: true };
  if (specifier.endsWith('/services/status-store.ts')) return { url: 'mock:status', shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (sources.has(url)) return { format: 'module', source: sources.get(url), shortCircuit: true };
  return nextLoad(url, context);
}
`);

  const script = `
import { main } from '../../../../skills/nova/pipeline/cli.ts';
import { getActiveContext } from '../../../../skills/nova/pipeline/core/logger.ts';
import { getInitLogDirCalls } from '../../../../skills/nova/pipeline/services/status-store.ts';
process.argv = [process.execPath, 'mock-cli-test', '--project', 'demo', '--status'];
const exitCode = await main();
console.log(JSON.stringify({ exitCode, activeContext: getActiveContext(), initLogDirCalls: getInitLogDirCalls() }));
`;
  const child = spawnSync(process.execPath, ['--loader', loaderPath, '--input-type=module', '--eval', script], {
    cwd: __dirname,
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    exitCode: 0,
    activeContext: null,
    initLogDirCalls: 0,
  });
});
