import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-buster-repo-scoped-paths' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isPathInside,
  REPO_DIR,
  resolveRepoDir,
  resolveRepoScopedPath,
} from '../../../skills/buster/pipeline/suites/repo-paths.ts';
import {
  isPathInside as commonIsPathInside,
  resolveScopedPath,
} from '../../../skills/common/pipeline/security.ts';
import {
  resolveVisualRegBaselineDir,
  resolveVisualRegProjectDir,
  runVisualReg,
} from '../../../skills/buster/pipeline/suites/visual-reg.ts';
import { resolvePerfReportPaths } from '../../../skills/buster/pipeline/suites/perf.ts';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertRejectsPath(label, input, options) {
  assert.throws(
    () => resolveRepoScopedPath(input, options),
    /escapes allowed repository scope|contains a null byte/,
    `${label} should reject ${input}`
  );
}

const { sourceRoot } = parseArgs();
assert.equal(REPO_DIR, sourceRoot, 'Buster suite repo root resolves from the active repository');
assert.equal(resolveRepoDir(sourceRoot), sourceRoot, 'resolveRepoDir returns the shared git root for an explicit start path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-repo-scope-'));
const repoDir = path.join(tempRoot, 'repo');
const projectDir = path.join(repoDir, 'Projects/demo');
const siblingProjectDir = path.join(repoDir, 'Projects/demolition');
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(siblingProjectDir, { recursive: true });

assert.equal(isPathInside(projectDir, repoDir), true, 'project is inside repo');
assert.equal(commonIsPathInside(projectDir, repoDir), true, 'common helper agrees project is inside repo');
assert.equal(isPathInside(path.join(tempRoot, 'outside'), repoDir), false, 'outside path is not inside repo');
assert.equal(commonIsPathInside(path.join(tempRoot, 'outside'), repoDir), false, 'common helper agrees outside path is not inside repo');

assert.equal(
  resolveRepoScopedPath('Projects/demo/Dockerfile', { repoDir, field: 'dockerfile' }),
  path.join(projectDir, 'Dockerfile'),
  'relative repo path resolves inside repo'
);

assert.equal(
  resolveRepoScopedPath(path.join(projectDir, 'deployment.yaml'), { repoDir, field: 'deployment_yaml' }),
  path.join(projectDir, 'deployment.yaml'),
  'absolute path inside repo is allowed'
);

assertRejectsPath('absolute host path', '/etc/passwd', { repoDir, field: 'project_dir' });
assertRejectsPath('relative traversal', '../../etc/passwd', { repoDir, field: 'project_dir' });
assertRejectsPath('null byte', 'Projects/demo\0secret', { repoDir, field: 'project_dir' });
assertRejectsPath('sibling project when scoped to project', '../demolition/tests', {
  repoDir,
  baseDir: projectDir,
  scopeDir: projectDir,
  field: 'e2e.tests_dir',
});
assert.throws(
  () => resolveScopedPath('../demolition/tests', {
    baseDir: projectDir,
    scopeDir: projectDir,
    field: 'common.path',
  }),
  /escapes allowed scope/,
  'common scoped path helper should reject the same sibling traversal',
);

assert.equal(
  resolveVisualRegProjectDir({ project_dir: 'Projects/demo' }),
  path.join(REPO_DIR, 'Projects/demo'),
  'visual-reg serve.project_dir resolves through repo-scoped helper',
);
assert.throws(
  () => resolveVisualRegProjectDir({ project_dir: '/etc' }),
  /escapes allowed repository scope/,
  'visual-reg serve.project_dir rejects absolute host paths',
);
assert.equal(
  resolveVisualRegBaselineDir({ moduleId: '01' }),
  path.join(REPO_DIR, '.swarm', 'modules', '01', 'baselines'),
  'visual-reg baseline dir is derived from module id',
);
const visualLegacy = await runVisualReg({
  moduleId: '01',
  config: { 'visual-reg': { baseline_dir: '/tmp/old-baselines' } },
});
assert.equal(visualLegacy.status, 'ERROR', 'visual-reg should reject removed baseline_dir config');
assert.match(visualLegacy.error, /baseline_dir is no longer supported/);
assert.throws(
  () => resolvePerfReportPaths({ testsLogDir: path.join(repoDir, '.swarm/logs/buster/01/attempt-1/tests'), attempt: 1 }, { output_path: '/tmp/lighthouse.json' }),
  /perf.output_path is no longer supported/,
  'perf should reject removed output_path config',
);
const perfReportPaths = resolvePerfReportPaths({
  moduleId: '01',
  runId: 'run-a',
  testsLogDir: path.join(repoDir, '.swarm/logs/buster/01/attempt-2/tests'),
  attempt: 2,
}, {});
assert.match(
  perfReportPaths.scratchPath,
  new RegExp(`${escapeRegExp(path.join(repoDir, '.swarm/logs/buster/01/attempt-2/tests/.lighthouse-report-01-attempt-2-run-a-'))}[a-z0-9._-]+\\.tmp\\.json$`),
  'perf scratch report path should stay inside the durable tests log artifact directory',
);
assert.match(
  perfReportPaths.finalPath,
  new RegExp(`${escapeRegExp(path.join(repoDir, '.swarm/logs/buster/01/attempt-2/tests/lighthouse-report-01-attempt-2-run-a-'))}[a-z0-9._-]+\\.json$`),
  'perf final report path should stay inside the durable tests log artifact directory',
);

const suiteFiles = [
  'build.ts',
  'e2e.ts',
  'api.ts',
  'unit.ts',
  'manifest.ts',
  'k8s.ts',
  'visual-reg.ts',
];
for (const file of suiteFiles) {
  const source = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/suites', file), 'utf8');
  assert.equal(
    source.includes('resolveRepoScopedPath'),
    true,
    `${file} should use repo-scoped path resolution for task-controlled paths`
  );
}

const repoPathsSource = fs.readFileSync(
  path.join(sourceRoot, 'skills/buster/pipeline/suites/repo-paths.ts'),
  'utf8'
);
assert.equal(repoPathsSource.includes('resolveScopedPath'), true, 'Buster repo path helper should delegate to common scoped path contract');
assert.equal(repoPathsSource.includes('/home/node/.openclaw/workspace/git-repo'), false, 'Buster repo path helper must not preserve a hardcoded host workspace root');
assert.equal(repoPathsSource.includes('getRepoRoot'), true, 'Buster repo path helper should use shared git root resolution');
const commonSecuritySource = fs.readFileSync(path.join(sourceRoot, 'skills/common/pipeline/security.ts'), 'utf8');
assert.equal(commonSecuritySource.includes('resolvedCandidate.startsWith(rootedPrefix(resolvedRoot))'), true, 'common scope check must use path.resolve plus canonical startsWith boundary semantics');

const visualRegSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/suites/visual-reg.ts'), 'utf8');
assert.equal(visualRegSource.includes('vrConf.baseline_dir') || visualRegSource.includes('vrConf.baseline_file'), false, 'visual-reg must not use task-configured baseline path fields');
const perfSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/suites/perf.ts'), 'utf8');
assert.equal(perfSource.includes('perfConf.output_path'), false, 'perf must not use task-configured output_path');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 29 }));
