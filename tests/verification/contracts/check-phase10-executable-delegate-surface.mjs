import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-executable-delegate-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';


function read(sourceRoot, relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

function assertIncludes(source, needle, message) {
  assert.equal(source.includes(needle), true, message);
}

function assertExcludes(source, needle, message) {
  assert.equal(source.includes(needle), false, message);
}

const { sourceRoot } = parseSourceRootArgs();

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
const standardProfile = read(sourceRoot, 'skills/nova/pipeline/core/config-profiles/standard.json');
assertIncludes(swarmConfig, '"profile": "standard"', 'Chart config must select the standard compact profile');
assertIncludes(standardProfile, '"/app/skills/pipeline/tools/lint-report.ts"', 'Standard profile must use canonical lint-report runtime delegate path');
assertIncludes(standardProfile, '"/app/skills/pipeline/tools/redis.ts"', 'Standard profile must use canonical Redis runtime delegate path');
assertExcludes(standardProfile, '"/app/skills/lint-report.ts"', 'Standard profile must not reference removed root lint-report alias');

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
