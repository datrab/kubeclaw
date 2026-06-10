import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-executable-delegate-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function read(sourceRoot, relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

function assertIncludes(source, needle, message) {
  assert.equal(source.includes(needle), true, message);
}

function assertExcludes(source, needle, message) {
  assert.equal(source.includes(needle), false, message);
}

const { sourceRoot } = parseArgs();

const busterShim = read(sourceRoot, 'skills/buster/buster-pipeline.ts');
assertIncludes(busterShim, 'await handleBusterEntrypoint();', 'Buster executable entrypoint must run the typed handler on direct execution');
assertExcludes(busterShim, 'export * from', 'Buster executable shim must not regrow broad helper exports');

const novaRootShim = read(sourceRoot, 'skills/nova/pipeline.ts');
assertIncludes(novaRootShim, "export * from './pipeline/index.ts';", 'Nova root shim must re-export the narrow typed public API');
assertIncludes(novaRootShim, "await import('./pipeline/cli.ts')", 'Nova root shim must delegate direct execution to the CLI facade');
assertExcludes(novaRootShim, './pipeline/runners/', 'Nova root shim must not import runner behavior directly');
assertExcludes(novaRootShim, './pipeline/services/', 'Nova root shim must not import service behavior directly');

const adapterRegistry = read(sourceRoot, 'skills/nova/pipeline/services/adapter-registry.ts');
assertIncludes(adapterRegistry, "new URL('../tools/redis.ts', import.meta.url)", 'Redis adapter registry must keep the canonical runtime JS delegate path');
assertIncludes(adapterRegistry, "new URL('../tools/project-summary.ts', import.meta.url)", 'Project-summary adapter registry must keep the canonical runtime JS delegate path');
assertIncludes(adapterRegistry, "'/app/skills/pipeline/tools/redis.ts'", 'Redis runtime path must stay under /app/skills/pipeline/tools');
assertIncludes(adapterRegistry, "'/app/skills/pipeline/tools/project-summary.ts'", 'Project-summary runtime path must stay under /app/skills/pipeline/tools');
assertExcludes(adapterRegistry, "'/app/skills/redis.ts'", 'Removed root Redis alias must stay absent');
assertExcludes(adapterRegistry, "'/app/skills/project-summary.ts'", 'Removed root project-summary alias must stay absent');

const swarmConfig = read(sourceRoot, 'charts/kubeclaw/files/config/swarm.config.json');
assertIncludes(swarmConfig, '"/app/skills/pipeline/tools/lint-report.ts"', 'Chart config must use canonical lint-report runtime delegate path');
assertIncludes(swarmConfig, '"/app/skills/pipeline/tools/redis.ts"', 'Chart config must use canonical Redis runtime delegate path');
assertExcludes(swarmConfig, '"/app/skills/lint-report.ts"', 'Chart config must not reference removed root lint-report alias');

for (const relativePath of [
  'skills/nova/pipeline/cli.ts',
  'skills/nova/pipeline/tools/lint-report.ts',
  'skills/nova/pipeline/tools/project-summary.ts',
  'skills/nova/pipeline/tools/redis.ts',
]) {
  const source = read(sourceRoot, relativePath);
  assertIncludes(source, '.ts', `${relativePath} must use TypeScript module references`);
  assertExcludes(source, '/app/skills/lint-report.ts', `${relativePath} must not preserve root lint-report alias`);
  assertExcludes(source, '/app/skills/redis.ts', `${relativePath} must not preserve root Redis alias`);
  assertExcludes(source, '/app/skills/project-summary.ts', `${relativePath} must not preserve root project-summary alias`);
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 6 }));
