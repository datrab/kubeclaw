import { parseSourceRootArgs, walkFiles } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-common-helper-import-surface' });
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { execFileSync } from 'child_process';
import { effectiveFiles, SHARED_PIPELINE_HELPER_PATHS } from '../lib/lifecycle-audit-lib.mjs';
import { expandSwarmConfig } from '../../../skills/nova/pipeline/core/platform-config.ts';
import {
  getRepoRoot,
  gitExec,
  headHash,
  invalidateHeadHash,
  setRepoRoot,
} from '../../../skills/common/pipeline/git-primitives.ts';


const walk = (dir) => walkFiles(dir, (file) => /\.(?:js|mjs|cjs|ts)$/.test(file));

const { sourceRoot, overlayRoot } = parseSourceRootArgs();
const previousSwarmConfig = process.env.SWARM_CONFIG;
const expandedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'common-helper-import-config-'));
const expandedConfigPath = path.join(expandedConfigDir, 'swarm.config.effective.json');
const compactConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8'));
fs.writeFileSync(expandedConfigPath, `${JSON.stringify(expandSwarmConfig(compactConfig), null, 2)}\n`);
process.env.SWARM_CONFIG = expandedConfigPath;
const commonFiles = [...effectiveFiles(sourceRoot, overlayRoot, 'skills/common/pipeline').keys()]
  .map((relPath) => relPath.replace(/\\/g, '/'))
  .filter((relPath) => SHARED_PIPELINE_HELPER_PATHS.includes(path.posix.join('pipeline', relPath)))
  .sort();
const expectedInventory = SHARED_PIPELINE_HELPER_PATHS
  .map((relPath) => relPath.replace(/^pipeline\//, ''))
  .sort();

assert.deepEqual(expectedInventory, commonFiles, 'shared helper inventory must match every declared skills/common/pipeline helper file');

const productionLocalMarkers = [
  [path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts'), "from './lifecycle.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts'), "from './acp-monitor.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts'), "from '../integrations/gateway.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/services/summary.ts'), "from '../agents/runtime.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/services/summary.ts'), "from '../agents/lifecycle.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/services/summary.ts'), "from '../agents/session-termination.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts'), "from '../agents/acp-monitor.ts'"],
  [path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/attempt.ts'), "from '../../agents/runtime.ts'"],
  [path.join(sourceRoot, 'skills/buster/buster-pipeline.ts'), "from './pipeline/agents/session-termination.ts'"],
  [path.join(sourceRoot, 'skills/buster/buster-pipeline.ts'), "from './pipeline/integrations/gateway.ts'"],
  [path.join(sourceRoot, 'skills/buster/pipeline/services/session-monitor.ts'), "from '../agents/acp-monitor.ts'"],
  [path.join(sourceRoot, 'skills/buster/pipeline/services/session-monitor.ts'), "from '../agents/session-termination.ts'"],
  [path.join(sourceRoot, 'skills/buster/pipeline/services/rate-limit.ts'), "from '../agents/acp-monitor.ts'"],
];

for (const [filePath, marker] of productionLocalMarkers) {
  assert.equal(fs.readFileSync(filePath, 'utf8').includes(marker), true, `${path.relative(sourceRoot, filePath)} should import production-local TypeScript facade ${marker}`);
}

const gitTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-primitives-head-cache-'));
function initRepo(name, fileContent) {
  const repo = path.join(gitTempRoot, name);
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q']);
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'test@example.invalid']);
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'Verification Test']);
  fs.writeFileSync(path.join(repo, 'file.txt'), fileContent);
  execFileSync('git', ['-C', repo, 'add', 'file.txt']);
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', `init ${name}`]);
  return repo;
}
try {
  const repoA = initRepo('repo-a', 'a\n');
  const repoB = initRepo('repo-b', 'b\n');
  const expectedA = execFileSync('git', ['-C', repoA, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const expectedB = execFileSync('git', ['-C', repoB, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const previousRepoRootEnv = process.env.REPO_ROOT;

  assert.equal(getRepoRoot(repoA), repoA, 'common getRepoRoot should resolve repo A root');
  process.env.REPO_ROOT = repoA;
  assert.equal(getRepoRoot('/app'), repoA, 'common getRepoRoot should map packaged /app runtime paths to REPO_ROOT');
  assert.equal(getRepoRoot('/app/skills/pipeline/suites'), repoA, 'common getRepoRoot should map packaged skill paths to REPO_ROOT');
  if (previousRepoRootEnv === undefined) delete process.env.REPO_ROOT;
  else process.env.REPO_ROOT = previousRepoRootEnv;
  assert.equal(gitExec(repoB, ['rev-parse', '--show-toplevel']), repoB, 'common gitExec should run against explicit repo B');
  setRepoRoot(repoA);
  assert.equal(headHash(), expectedA, 'default headHash should use current compatibility repo');
  setRepoRoot(repoB);
  assert.equal(headHash(), expectedB, 'default headHash should update to new compatibility repo');
  assert.equal(headHash(repoA), expectedA, 'explicit repo A headHash must not be overwritten by repo B default');

  fs.writeFileSync(path.join(repoA, 'file.txt'), 'a2\n');
  execFileSync('git', ['-C', repoA, 'add', 'file.txt']);
  execFileSync('git', ['-C', repoA, 'commit', '-q', '-m', 'update a']);
  const updatedA = execFileSync('git', ['-C', repoA, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(headHash(repoA), expectedA, 'repo-scoped headHash should cache per repo until invalidated');
  invalidateHeadHash(repoA);
  assert.equal(headHash({ repo_root: repoA }), updatedA, 'repo-scoped invalidation should refresh only the requested repo');
  assert.equal(headHash({ repo_root: repoB }), expectedB, 'repo B cached headHash should remain intact after repo A invalidation');
  assert.equal(headHash({ repo_root: path.join(gitTempRoot, 'missing-repo') }), null, 'unavailable headHash should surface typed null instead of magic empty string');
} finally {
  fs.rmSync(gitTempRoot, { recursive: true, force: true });
  fs.rmSync(expandedConfigDir, { recursive: true, force: true });
  if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
  else process.env.SWARM_CONFIG = previousSwarmConfig;
}

const pipelineReadme = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/README.md'), 'utf8');
assert.equal(pipelineReadme.includes('repo-local common facades'), true, 'pipeline README should describe repo-local common facades');
assert.equal(pipelineReadme.includes('compatibility'), false, 'pipeline README must not describe common facades as compatibility behavior');
assert.equal(pipelineReadme.includes('/app/common/pipeline'), false, 'pipeline README must not describe /app/common/pipeline as runtime surface');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 47 + commonFiles.length * 2 }));
