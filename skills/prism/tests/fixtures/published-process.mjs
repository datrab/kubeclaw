/** Real generation -> fixed installed boot paths, only in an explicit isolated test guest.
 * No capture injection, alternate reader, policy ENV, mount/trust or identity mock.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {declaredPipelineServices, materializePipelineGeneration} from '../../../../scripts/updates/pipeline-generation.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const installed = ['/app/prism', '/etc/kubeclaw/config', '/run/pipeline-delivery'];

/** Prepare genuine, immutable package/generation/expected receipts from the
 * caller's complete original source authors. This does not admit native work.
 */
export async function preparePrismProcessPublication(entryFile, callerId, builtRolePackage) {
  assert.ok(['prism-control', 'prism-worker'].includes(callerId));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-process-publication-'));
  try {
    const author = path.join(root, 'author');
    fs.cpSync(path.dirname(entryFile), author, {recursive: true});
    assert.equal(path.basename(entryFile), 'pipeline.config.json');
    const code = path.join(root, 'role'), output = path.join(root, 'generation');
    const publisher = path.join(root, 'publish');
    execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', path.join(repo, 'scripts/pipeline-publish.c'), '-o', publisher]);
    const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
    if (builtRolePackage) {
      // Copy the SAME genuine builder output, never a hand-built identity. The
      // materializer below authenticates its manifest and every packaged byte.
      fs.cpSync(builtRolePackage, code, {recursive: true, verbatimSymlinks: true});
    } else {
      execFileSync(process.execPath, [path.join(repo, 'scripts/build-runtime-role-bundle.mjs'), 'prism', code,
        revision, 'original-process-test-fixture', new Date().toISOString()], {cwd: repo, stdio: 'pipe'});
    }
    const services = declaredPipelineServices(author, {role: 'prism', namespace: 'kubeclaw', releaseName: 'prism'});
    await materializePipelineGeneration({authorRoot: author, packageRoot: code, output, services, publisher});
    const mount = path.join(root, 'transport'); fs.mkdirSync(mount);
    fs.cpSync(path.join(output, 'expected', callerId), path.join(mount, 'version-A'), {recursive: true});
    fs.symlinkSync('version-A', path.join(mount, '..data'));
    return {root, author, code, system: path.join(output, 'system'), mount, callerId};
  } catch (error) {
    fs.rmSync(root, {recursive: true, force: true}); throw error;
  }
}

/** Own the original entrypoint and its installed files for the entire child
 * lifetime. Existing installations are never overwritten or removed. A native
 * worker still owes its real launcher/cgroup/pool admission inside the guest.
 */
export async function spawnInstalledPrismProcess(t, entryFile, callerId, environment, failedDiagnosticSink = false, builtRolePackage) {
  assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, 'true', 'An explicit isolated process test guest is required');
  assert.equal(process.getuid?.(), 0, 'Fixture installation requires genuine guest root');
  assert.ok(!failedDiagnosticSink || callerId === 'prism-control');
  // Fail before compiling if the guest has another installed owner. Exclusive
  // directory creation below is the actual reservation, not this early check.
  for (const target of installed) assert.equal(fs.existsSync(target), false, `Existing installation: ${target}`);
  const publication = await preparePrismProcessPublication(entryFile, callerId, builtRolePackage);
  const owned = [], parents = [];
  let child, exited;
  const remove = () => {
    for (const target of [...owned].reverse()) fs.rmSync(target, {recursive: true, force: true});
    for (const parent of [...parents].reverse()) fs.rmdirSync(parent);
    fs.rmSync(publication.root, {recursive: true, force: true});
  };
  try {
    for (const [index, target] of installed.entries()) {
      const parent = path.dirname(target);
      if (!fs.existsSync(parent)) { fs.mkdirSync(parent, {mode: 0o755}); parents.push(parent); }
      fs.mkdirSync(target, {mode: 0o755}); owned.push(target);
      const source = [publication.code, publication.system, publication.mount][index];
      fs.cpSync(source, target, {recursive: true, verbatimSymlinks: true});
    }
    const entrypoint = `/app/prism/skills/packages/prism-engine/server/${callerId === 'prism-control' ? 'control' : 'worker'}.ts`;
    const args = failedDiagnosticSink ? ['--input-type=module', '--eval',
      `import {closeSync} from 'node:fs'; closeSync(process.stderr.fd); await import(${JSON.stringify(entrypoint)});`] : [entrypoint];
    // The supplied environment is explicit: never inherit retired SWARM_CONFIG,
    // PORT or controlInternalUrl policy authors from the scheduling/test host.
    child = spawn(process.execPath, args, {env: environment, stdio: ['ignore', 'pipe', 'pipe']});
    exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
    t.after(async () => {
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM');
          const cutoff = setTimeout(() => child.kill('SIGKILL'), 5000);
          try { await exited; } finally { clearTimeout(cutoff); }
        }
      } finally { remove(); }
    });
    return {child, publication};
  } catch (error) {
    if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    remove(); throw error;
  }
}
