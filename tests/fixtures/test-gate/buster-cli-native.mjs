import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { declaredPipelineServices, materializePipelineGeneration } from '../../../scripts/updates/pipeline-generation.mjs';
import { cliProfile } from './buster-cli-profile.mjs';
import { preparedPlanStateRoot, preparedPlanRuntimeRoot } from '../../../skills/buster/engine/test-gates/prepared-plan-paths.ts';
import { currentTestCgroup } from '../../verification/reliability/native-test-cgroup.mts';

// Install an actual image/generation into a private mount namespace. Neither
// the privileged parent, guardian, CLI nor their startup protocol is replaced.
export async function nativeCli(root, admission) {
  assert.equal(process.getuid(), 0);
  assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, 'true');
  // Fail before any host setup when the caller cannot isolate installed paths.
  execFileSync('/usr/bin/unshare', ['--mount', '--propagation', 'private', '/bin/true']);
  const repository = process.cwd(), jail = path.join(root, 'jail');
  fs.mkdirSync(jail);
  const directory = (name, mode = 0o755, uid = 0, gid = 0) => {
    const target = path.join(jail, name);
    fs.mkdirSync(target, { recursive: true, mode });
    fs.chmodSync(target, mode); fs.chownSync(target, uid, gid);
    return target;
  };
  const write = (name, value, mode = 0o644) => fs.writeFileSync(path.join(jail, name), value, { mode });
  const author = path.join(root, 'author'); fs.cpSync('config', author, { recursive: true });
  const component = path.join(author, 'components/buster-engine.config.json');
  const document = JSON.parse(fs.readFileSync(component));
  document.profiles.runtime.settings.admission = admission;
  fs.writeFileSync(component, JSON.stringify(document));
  const packageRoot = path.join(jail, 'app'), publisher = path.join(root, 'publish');
  execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', 'scripts/pipeline-publish.c', '-o', publisher]);
  const revision = execFileSync('git', ['-c', `safe.directory=${repository}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync(process.execPath, ['scripts/build-runtime-role-bundle.mjs', 'buster', packageRoot,
    revision, 'pipeline-image-projection.v1', new Date().toISOString()], { stdio: 'pipe' });
  const generation = path.join(root, 'generation');
  await materializePipelineGeneration({ authorRoot: author, packageRoot, output: generation,
    services: declaredPipelineServices(author, { role: 'buster', namespace: 'kubeclaw', releaseName: 'agent-buster' }), publisher });
  directory('etc/kubeclaw');
  fs.cpSync(path.join(generation, 'system'), path.join(jail, 'etc/kubeclaw/config'), { recursive: true });
  directory('run/pipeline-delivery');
  fs.cpSync(path.join(generation, 'expected/buster-preparation'), path.join(jail, 'run/pipeline-delivery/version'), { recursive: true });
  fs.symlinkSync('version', path.join(jail, 'run/pipeline-delivery/..data'));
  directory('run/kubeclaw-buster'); directory('run/kubeclaw-buster/config', 0o750, 0, 1000);
  write('run/kubeclaw-buster/lifetime.lock', '', 0o600);
  directory('var/lib/buster-v2'); directory('var/lib/buster-v2/native-sources');
  directory('var/lib/buster-v2/plan-jobs', 0o700, 1000, 1000);
  directory('var/lib/buster-v2/runs', 0o700, 1000, 1000);
  for (const writable of [preparedPlanStateRoot('/var/lib/buster-v2/plan-jobs'), preparedPlanRuntimeRoot('/var/lib/buster-v2/runs')]) {
    directory(writable.slice(1), 0o700, 1000, 1000);
  }
  directory('var/lib/buster-v2/platform-state', 0o700, 1000, 1000);
  directory('var/lib/native-ownership'); directory('native'); directory('tmp', 0o1777);
  // copyFile preserves source ownership (setup-node is runner-owned). Install
  // the private executable as root, as required by the real native parent.
  const node = path.join(jail, 'native/node');
  execFileSync('/usr/bin/install', ['-o', '0', '-g', '0', '-m', '0755', process.execPath, node]);
  assert.equal(fs.statSync(node).uid, 0);
  assert.equal(fs.statSync(node).mode & 0o7777, 0o755);
  const libexec = directory('native/libexec');
  for (const [source, name] of [['scripts/buster-lifetime-guardian.c', 'kubeclaw-buster-lifetime-guardian'],
    ['skills/worker/core/worker/native-worker-launcher.c', 'kubeclaw-native-worker-launcher']]) {
    execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', source, '-o', path.join(libexec, name)]);
  }
  // Source public key belongs to this real runtime fixture, never to a shaped
  // original-boot receipt. The production parent validates it before startup.
  const profile = cliProfile(root, admission);
  const runtime = JSON.parse(fs.readFileSync(profile.runtime));
  runtime.platformConfig = '/native/platform.json'; runtime.stateRoot = '/var/lib/buster-v2/plan-jobs';
  runtime.runtimeRoot = '/var/lib/buster-v2/runs';
  write('run/kubeclaw-buster/config/runtime.json', JSON.stringify(runtime), 0o640);
  fs.chownSync(path.join(jail, 'run/kubeclaw-buster/config/runtime.json'), 0, 1000);
  const platform = JSON.parse(fs.readFileSync(path.join(root, 'platform.json')));
  // The current generation codec carries component authors only. Preserve
  // the platform fixture's separate original Core/review input closure.
  fs.cpSync(author, path.join(jail, 'native/platform-author'), { recursive: true });
  platform.corePolicySelection.file = '/native/platform-author/nova/core.config.json';
  platform.installationRoots = ['/app/skills/plugins']; platform.trustedBuiltinRoots = ['/app/skills/plugins'];
  platform.storageRoot = '/var/lib/buster-v2/platform-state';
  write('native/platform.json', JSON.stringify(platform));
  const namespace = fs.statSync('/proc/self/ns/cgroup', { bigint: true });
  write('native/runtime-identity.json', JSON.stringify({ schemaVersion: 1,
    bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    cgroupNamespace: { device: String(namespace.dev), inode: String(namespace.ino) } }));
  write('native/node-identity', fs.readFileSync('/etc/machine-id'));
  const scope = currentTestCgroup();
  assert.notEqual(scope, '/sys/fs/cgroup', 'requires an actual accounted scope');
  const pool = path.join(path.dirname(scope), `buster-cli-${crypto.randomUUID()}`);
  const preparation = document.profiles.runtime.settings.preparation;
  const limits = { memoryBytes: preparation.resourcePolicy.memoryBytes, tasks: preparation.resourcePolicy.tasks,
    cpuQuotaMicroseconds: 100000, cpuPeriodMicroseconds: 100000 };
  fs.mkdirSync(pool);
  try {
    // The production allocator requires a genuinely delegated, empty pool,
    // not merely aggregate limits on a cgroup leaf.
    fs.writeFileSync(path.join(pool, 'cgroup.subtree_control'), '+cpu +memory +pids');
    for (const [name, value] of Object.entries({ 'memory.max': limits.memoryBytes, 'memory.swap.max': 0,
      'pids.max': limits.tasks, 'cpu.max': `${limits.cpuQuotaMicroseconds} ${limits.cpuPeriodMicroseconds}` })) {
      fs.writeFileSync(path.join(pool, name), String(value));
    }
    const policy = { schemaVersion: 1, role: 'buster', nodeName: 'native-cli-test',
      policyDigest: crypto.createHash('sha256').update(JSON.stringify(limits)).digest('hex'), cgroupRoot: pool,
      ownershipRoot: '/var/lib/native-ownership', nodeIdentityFile: '/native/node-identity',
      runtimeIdentityFile: '/native/runtime-identity.json', maximumActiveScopes: preparation.maximumActivePreparations, limits };
    write('native/pool.json', JSON.stringify(policy));
    const mounts = ['/usr', '/bin', '/lib', '/lib64', '/proc', '/sys', '/dev'];
    for (const mount of mounts) if (fs.existsSync(mount)) directory(mount.slice(1));
    // All mounts live below the fresh jail and disappear with unshare. The
    // inherited host cgroup namespace is retained for real identity checking.
    const launcher = path.join(root, 'launch.sh');
    fs.writeFileSync(launcher, `#!/bin/sh\nset -eu\njail=$1\nshift\nfor source in /usr /bin /lib /lib64 /proc /sys /dev; do\n  if [ -e "$source" ]; then mount --rbind "$source" "$jail$source"; fi\ndone\nmount -t tmpfs tmpfs "$jail/usr/local"\nmkdir "$jail/usr/local/libexec"\nmount --bind "$jail/native/libexec" "$jail/usr/local/libexec"\nexec chroot "$jail" /bin/sh -c 'exec 9<>/run/kubeclaw-buster/lifetime.lock; flock -n 9; exec /native/node /app/skills/packages/buster-engine/native-parent.ts'\n`);
    const environment = { ...profile.environment, KUBECLAW_BUILD_REVISION: revision,
      BUSTER_NATIVE_POOL_POLICY_FILE: '/native/pool.json',
      BUSTER_ENGINE_CONTENT_DIGEST: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(packageRoot, 'skills/packages/buster-engine/native-parent.ts'))).digest('hex')}` };
    delete environment.SWARM_CONFIG; delete environment.NODE_TEST_CONTEXT;
    const child = spawn('/usr/bin/unshare', ['--mount', '--propagation', 'private', '/bin/sh', launcher, jail],
      { cwd: repository, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    return { child, jail, pool, dispose: () => fs.rmdirSync(pool) };
  } catch (error) { fs.rmdirSync(pool); throw error; }
}
