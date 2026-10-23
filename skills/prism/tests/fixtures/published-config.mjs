import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { declaredPipelineServices, materializePipelineGeneration } from '../../../../scripts/updates/pipeline-generation.mjs';
import { captureSwarmSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));

/** Genuine published role, receipts and same-module authenticated consumer capture.
 * Requires actual root-owned test storage; never substitutes a synthetic boot capture.
 */
export async function publishedControlConfig(t, changes = {}, workerChanges = undefined, studioChanges = undefined, mutateAuthor = undefined, deployment = 'services') {
  assert.equal(process.getuid?.(), 0, 'published configuration fixture requires genuine root-owned storage');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-published-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = path.join(root, 'role'), author = path.join(root, 'author');
  const output = path.join(root, 'generation'), publisher = path.join(root, 'publish');
  fs.cpSync(path.join(repo, 'config'), author, { recursive: true });
  const entryFile = path.join(author, 'pipeline.config.json');
  const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
  for (const binding of entry.bindings) if (binding.owner === 'prism-control') binding.profileId = 'standard';
  fs.writeFileSync(entryFile, JSON.stringify(entry));
  const file = path.join(author, 'components/prism-control.config.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(value.profiles.standard.settings, changes);
  fs.writeFileSync(file, JSON.stringify(value));
  if (workerChanges !== undefined) {
    const workerFile = path.join(author, 'components/prism-worker.config.json');
    const workerValue = JSON.parse(fs.readFileSync(workerFile, 'utf8'));
    Object.assign(workerValue.profiles.standard.settings, workerChanges);
    fs.writeFileSync(workerFile, JSON.stringify(workerValue));
  }
  if (studioChanges !== undefined) {
    const studioFile = path.join(author, 'components/prism-studio.config.json');
    const studioValue = JSON.parse(fs.readFileSync(studioFile, 'utf8'));
    Object.assign(studioValue.profiles.standard.settings, studioChanges);
    fs.writeFileSync(studioFile, JSON.stringify(studioValue));
  }
  if (mutateAuthor !== undefined) await mutateAuthor(author);
  const services = declaredPipelineServices(author, { role: 'prism', namespace: 'kubeclaw', releaseName: deployment === 'agent-bridge' ? 'agent-prism' : 'prism', deployment });
  // Reject invalid complete author sets with the SAME production reader before
  // compiling/copying a role for each malformed-leaf control. This is validation
  // only, never boot authentication: valid cases still build, publish and load
  // the genuine installed package below, whose materializer revalidates authors.
  for (const service of services) captureSwarmSettings(entryFile, service);
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', path.join(repo, 'scripts/pipeline-publish.c'), '-o', publisher]);
  // Publish from the actual checked-out source identity. This remains local
  // source verification, not proof that the worktree equals a clean commit.
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const builtAt = new Date().toISOString();
  execFileSync(process.execPath, [path.join(repo, 'scripts/build-runtime-role-bundle.mjs'), 'prism', code,
    revision, 'config-service-test-fixture', builtAt], { cwd: repo, stdio: 'pipe' });
  const receipt = JSON.parse(fs.readFileSync(path.join(code, 'manifest.json'), 'utf8'));
  assert.equal(receipt.commit, revision);
  assert.equal(receipt.builtAt, builtAt);
  await materializePipelineGeneration({ authorRoot: author, packageRoot: code, output, services, publisher });
  const mount = path.join(root, 'transport'); fs.mkdirSync(mount);
  fs.cpSync(path.join(output, 'expected', deployment === 'agent-bridge' ? 'prism-agent-bridge' : 'prism-control'), path.join(mount, 'version-A'), { recursive: true });
  fs.symlinkSync('version-A', path.join(mount, '..data'));
  const boot = await import(pathToFileURL(path.join(code, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
  const capture = boot.capturePipelineBootReceipts(mount, path.join(output, 'system'), deployment === 'agent-bridge' ? 'prism-agent-bridge' : 'prism-control', code, '/app/prism/skills');
  const config = await import(pathToFileURL(path.join(code, 'skills/packages/prism-engine/server/control-config.ts')).href);
  let worker = {};
  if (workerChanges !== undefined) {
    const workerMount = path.join(root, 'worker-transport'); fs.mkdirSync(workerMount);
    fs.cpSync(path.join(output, 'expected/prism-worker'), path.join(workerMount, 'version-A'), { recursive: true });
    fs.symlinkSync('version-A', path.join(workerMount, '..data'));
    const workerCapture = boot.capturePipelineBootReceipts(workerMount, path.join(output, 'system'), 'prism-worker', code, '/app/prism/skills');
    const workerConfig = await import(pathToFileURL(path.join(code, 'skills/packages/prism-engine/server/worker-config.ts')).href);
    worker = {workerCapture, ...workerConfig};
  }
  let studio = {};
  if (studioChanges !== undefined) {
    const studioMount = path.join(root, 'studio-transport'); fs.mkdirSync(studioMount);
    fs.cpSync(path.join(output, 'expected/prism-studio'), path.join(studioMount, 'version-A'), { recursive: true });
    fs.symlinkSync('version-A', path.join(studioMount, '..data'));
    const studioCapture = boot.capturePipelineBootReceipts(studioMount, path.join(output, 'system'), 'prism-studio', code, '/app/prism/skills');
    const studioConfig = await import(pathToFileURL(path.join(code, 'skills/packages/prism-engine/server/studio-config.ts')).href);
    studio = {studioCapture, ...studioConfig};
  }
  return { root, author, capture, ...config, ...worker, ...studio };
}

/** Capture an additional real service from the same published role/generation. */
export async function publishedServiceConfig(t, caller, changes = {}) {
  const fixture = await publishedControlConfig(t, changes, undefined, undefined, undefined, caller === 'prism-agent-bridge' ? 'agent-bridge' : 'services');
  const code = path.join(fixture.root, 'role'), output = path.join(fixture.root, 'generation');
  const mount = path.join(fixture.root, `${caller}-transport`); fs.mkdirSync(mount);
  fs.cpSync(path.join(output, 'expected', caller), path.join(mount, 'version-A'), { recursive: true });
  fs.symlinkSync('version-A', path.join(mount, '..data'));
  const boot = await import(pathToFileURL(path.join(code, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
  const capture = boot.capturePipelineBootReceipts(mount, path.join(output, 'system'), caller, code, '/app/prism/skills');
  return { ...fixture, code, output, mount, capture };
}
