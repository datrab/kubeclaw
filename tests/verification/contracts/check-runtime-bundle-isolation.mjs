import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-bundle-isolation-'));
const commit = '0000000000000000000000000000000000000000';
const builtAt = '1970-01-01T00:00:00Z';
const allowedServer = net.createServer();
const deniedServer = net.createServer();
allowedServer.listen(0, '127.0.0.1');
deniedServer.listen(0, '127.0.0.1');
await Promise.all([once(allowedServer, 'listening'), once(deniedServer, 'listening')]);

function build(role, name, fixtureRoot = root) {
  const output = path.join(temporary, name);
  execFileSync(process.execPath, [path.join(fixtureRoot, 'scripts/build-runtime-role-bundle.mjs'), role, output, commit, 'v2', builtAt]);
  return output;
}

function treeDigest(directory) {
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.posix.join(relative.split(path.sep).join('/'), entry.name);
      const absolute = path.join(directory, child);
      hash.update(String(fs.lstatSync(absolute).mode & 0o777));
      hash.update('\0');
      hash.update(child);
      hash.update('\0');
      if (entry.isSymbolicLink()) hash.update(`link:${fs.readlinkSync(absolute)}`);
      else if (entry.isDirectory()) visit(child);
      else hash.update(fs.readFileSync(absolute));
      hash.update('\0');
    }
  }
  visit('');
  return hash.digest('hex');
}

function pluginDirectories(bundle) {
  return fs.readdirSync(path.join(bundle, 'skills/plugins'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function createFixture(mutator) {
  const fixture = fs.mkdtempSync(path.join(temporary, 'fixture-'));
  fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'packaging'), { recursive: true });
  fs.cpSync(path.join(root, 'packaging/runtime'), path.join(fixture, 'packaging/runtime'), { recursive: true });
  for (const script of ['build-runtime-role-bundle.mjs', 'check-runtime-role-manifests.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', script), path.join(fixture, 'scripts', script));
  }
  for (const directory of ['skills', 'contracts', 'node_modules']) {
    fs.symlinkSync(path.join(root, directory), path.join(fixture, directory), 'dir');
  }
  mutator(fixture);
  return fixture;
}

function createMutableFixture() {
  const fixture = fs.mkdtempSync(path.join(temporary, 'mutable-fixture-'));
  fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'packaging'), { recursive: true });
  fs.cpSync(path.join(root, 'packaging/runtime'), path.join(fixture, 'packaging/runtime'), { recursive: true });
  for (const script of ['build-runtime-role-bundle.mjs', 'check-runtime-role-manifests.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', script), path.join(fixture, 'scripts', script));
  }
  fs.cpSync(path.join(root, 'skills'), path.join(fixture, 'skills'), { recursive: true });
  fs.cpSync(path.join(root, 'contracts'), path.join(fixture, 'contracts'), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  return fixture;
}

function rewriteJson(file, update) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  update(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  const supervisorPidFile = path.join(temporary, 'supervisor-descendant.pid');
  const supervisorFixture = path.join(temporary, 'supervisor-descendant.sh');
  fs.writeFileSync(supervisorFixture, `#!/bin/sh
/usr/bin/setsid /bin/sh -c 'echo $$ > ${supervisorPidFile}; while :; do /bin/sleep 1; done' &
while [ ! -s ${supervisorPidFile} ]; do /bin/sleep 0.01; done
exit 0
`, { mode: 0o700 });
  const supervisorResult = spawnSync(
    path.join(root, 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox'),
    ['67108864', '10', '64', '--no-address-space-limit', supervisorFixture],
    { timeout: 5000 },
  );
  assert.equal(supervisorResult.status, 0, `supervisor fixture failed: ${supervisorResult.stderr}`);
  const escapedPid = Number(fs.readFileSync(supervisorPidFile, 'utf8').trim());
  assert.ok(Number.isSafeInteger(escapedPid) && escapedPid > 1, 'supervisor fixture did not record a PID');
  assert.throws(() => process.kill(escapedPid, 0), (error) => error?.code === 'ESRCH',
    'setsid descendant survived the supervisor boundary');

  const cancelledPidFile = path.join(temporary, 'cancelled-descendant.pid');
  const cancellationFixture = path.join(temporary, 'cancellation-supervisor.sh');
  fs.writeFileSync(cancellationFixture, `#!/bin/sh
/usr/bin/setsid /bin/sh -c 'echo $$ > ${cancelledPidFile}; while :; do /bin/sleep 1; done' &
while :; do /bin/sleep 1; done
`, { mode: 0o700 });
  const cancellationSupervisor = spawn(
    path.join(root, 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox'),
    ['67108864', '10', '64', '--no-address-space-limit', cancellationFixture],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const cancellationDeadline = Date.now() + 3000;
  while (!fs.existsSync(cancelledPidFile) && Date.now() < cancellationDeadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fs.existsSync(cancelledPidFile), true, 'cancelled supervisor fixture did not record a PID');
  const cancelledDescendantPid = Number(fs.readFileSync(cancelledPidFile, 'utf8').trim());
  assert.ok(cancellationSupervisor.pid, 'cancelled supervisor has no PID');
  process.kill(-cancellationSupervisor.pid, 'SIGTERM');
  await once(cancellationSupervisor, 'close');
  assert.throws(() => process.kill(cancelledDescendantPid, 0), (error) => error?.code === 'ESRCH',
    'setsid descendant survived supervisor cancellation');

  const allowedAddress = allowedServer.address();
  const deniedAddress = deniedServer.address();
  assert.ok(allowedAddress && typeof allowedAddress !== 'string' && deniedAddress && typeof deniedAddress !== 'string');
  const networkFixture = path.join(temporary, 'network-boundary.mjs');
  fs.writeFileSync(networkFixture, `import net from 'node:net';
const allowed = net.connect(${allowedAddress.port}, '127.0.0.1');
allowed.once('error', () => process.exit(2));
allowed.once('connect', () => {
  allowed.destroy();
  const denied = net.connect(${deniedAddress.port}, '127.0.0.1');
  denied.once('connect', () => process.exit(3));
  denied.once('error', (error) => process.exit(error.code === 'EACCES' || error.code === 'EPERM' ? 0 : 4));
});
`);
  const networkResult = spawnSync(
    path.join(root, 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox'),
    ['67108864', '10', '64', '--allow-network', '--connect-tcp-port', String(allowedAddress.port),
      '--read-root', '/usr', '--read-root', '/etc/ssl', '--write-root', temporary, process.execPath, networkFixture],
    { timeout: 5000 },
  );
  assert.equal(networkResult.status, 0, `network boundary fixture failed: ${networkResult.stderr}`);

  const udpFixture = path.join(temporary, 'udp-boundary.mjs');
  fs.writeFileSync(udpFixture, `import dgram from 'node:dgram';
const socket = dgram.createSocket('udp4');
socket.once('error', (error) => process.exit(error.code === 'EACCES' || error.code === 'EPERM' ? 0 : 2));
socket.send(Buffer.from('denied'), 53, '127.0.0.1', (error) => process.exit(error?.code === 'EACCES' || error?.code === 'EPERM' ? 0 : 3));
`);
  const udpResult = spawnSync(
    path.join(root, 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox'),
    ['67108864', '10', '64', '--allow-network', '--connect-tcp-port', String(allowedAddress.port),
      '--read-root', '/usr', '--read-root', '/etc/ssl', '--write-root', temporary, process.execPath, udpFixture],
    { timeout: 5000 },
  );
  assert.equal(udpResult.status, 0, `UDP boundary fixture failed: ${udpResult.stderr}`);

  const rawSocketSource = path.join(temporary, 'raw-socket-boundary.c');
  const rawSocketFixture = path.join(temporary, 'raw-socket-boundary');
  fs.writeFileSync(rawSocketSource, `#include <errno.h>\n#include <linux/if_ether.h>\n#include <linux/netlink.h>\n#include <netinet/in.h>\n#include <sys/socket.h>\nint main(void) { int packet = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL)); if (packet >= 0 || errno != EPERM) return 2; int netlink = socket(AF_NETLINK, SOCK_RAW, NETLINK_ROUTE); return netlink < 0 && errno == EPERM ? 0 : 3; }\n`);
  assert.equal(spawnSync('cc', ['-O2', '-o', rawSocketFixture, rawSocketSource]).status, 0,
    'raw-socket denial fixture did not compile');
  const rawSocketResult = spawnSync(
    path.join(root, 'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox'),
    ['67108864', '10', '64', '--allow-network', '--connect-tcp-port', String(allowedAddress.port),
      '--read-root', '/usr', '--read-root', '/lib', '--read-root', '/lib64', '--write-root', temporary, rawSocketFixture],
    { timeout: 5000 },
  );
  assert.equal(rawSocketResult.status, 0, `raw socket boundary fixture failed: ${rawSocketResult.stderr}`);

  const novaA = build('nova', 'nova-a');
  const novaB = build('nova', 'nova-b');
  const busterA = build('buster', 'buster-a');
  const busterB = build('buster', 'buster-b');
  const prismA = build('prism', 'prism-a');
  const prismB = build('prism', 'prism-b');
  assert.equal(treeDigest(novaA), treeDigest(novaB), 'Nova bundle tree is not reproducible');
  assert.equal(treeDigest(busterA), treeDigest(busterB), 'Buster bundle tree is not reproducible');
  assert.equal(treeDigest(prismA), treeDigest(prismB), 'Prism bundle tree is not reproducible');

  assert.equal(fs.existsSync(path.join(novaA, 'skills/packages/worker-core')), false);
  assert.equal(fs.existsSync(path.join(novaA, 'skills/packages/buster-engine')), false);
  assert.equal(fs.existsSync(path.join(busterA, 'skills/packages/nova-core')), false);
  assert.equal(fs.existsSync(path.join(busterA, 'skills/packages/worker-core')), true);
  assert.equal(fs.existsSync(path.join(busterA, 'skills/packages/buster-engine')), true);
  assert.equal(fs.existsSync(path.join(prismA, 'skills/packages/nova-core')), false);
  assert.equal(fs.existsSync(path.join(prismA, 'skills/packages/buster-engine')), false);
  assert.equal(fs.existsSync(path.join(prismA, 'skills/packages/prism-contract/schemas/prism-v1.schema.json')), true);
  assert.equal(fs.existsSync(path.join(prismA, 'skills/packages/prism-contract/fixtures/minimal-web.json')), true);

  for (const [role, bundle] of [['nova', novaA], ['buster', busterA], ['prism', prismA]]) {
    const entrypoint = pathToFileURL(path.join(bundle, 'skills', role === 'nova' ? 'pipeline.ts' : 'runtime.ts')).href;
    const expression = role === 'nova'
      ? `import('${entrypoint}').then(m=>{if(typeof m.PipelineRunner!=='function'||'WorkerAttemptExecutor' in m)process.exit(2)})`
      : role === 'buster'
        ? `import('${entrypoint}').then(m=>{if(typeof m.TestPlanRunner!=='function'||'PipelineRunner' in m)process.exit(2)})`
        : `import('${entrypoint}').then(m=>{if(typeof m.PrismEngine!=='function'||'PipelineRunner' in m)process.exit(2)})`;
    execFileSync(process.execPath, ['-e', expression], {
      cwd: temporary,
      env: { PATH: process.env.PATH ?? '', HOME: temporary, NODE_PATH: '', NODE_NO_WARNINGS: '1' },
    });
  }

  for (const role of ['nova', 'buster', 'prism']) {
    const roleManifest = JSON.parse(fs.readFileSync(path.join(root, `packaging/runtime/roles/${role}.json`), 'utf8'));
    const expected = [...roleManifest.plugins.map((id) => {
      for (const base of ['skills/common/plugins', `skills/${role}/plugins`]) {
        const directory = path.join(root, base);
        const match = fs.readdirSync(directory, { withFileTypes: true }).find((entry) => {
          const file = path.join(directory, entry.name, 'plugin.json');
          return entry.isDirectory() && fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).id === id;
        });
        if (match) return match.name;
      }
      throw new Error(`missing selected plugin source: ${id}`);
    }), 'openclaw-agent-observer'].sort();
    const bundle = role === 'nova' ? novaA : role === 'buster' ? busterA : prismA;
    assert.deepEqual(pluginDirectories(bundle), expected, `${role} plugin set is not exact`);
  }

  assert.equal(fs.existsSync(path.join(root, 'skills/common/plugin-runtime/core')), false);
  for (const roleRoot of ['skills/nova/core', 'skills/worker/core', 'skills/buster/engine']) {
    assert.equal(fs.existsSync(path.join(root, roleRoot, 'plugin-runtime')), false, `shared source was copied into ${roleRoot}`);
  }

  const missingClosure = createFixture((fixture) => rewriteJson(path.join(fixture, 'packaging/runtime/roles/nova.json'), (value) => {
    value.packages = value.packages.filter((id) => id !== 'pipeline-test-gate-contract');
  }));
  assert.notEqual(spawnSync(process.execPath, [path.join(missingClosure, 'scripts/check-runtime-role-manifests.mjs')]).status, 0,
    'missing package dependency must fail');

  const forbiddenOwner = createFixture((fixture) => rewriteJson(path.join(fixture, 'packaging/runtime/roles/nova.json'), (value) => {
    value.packages.push('worker-core');
  }));
  assert.notEqual(spawnSync(process.execPath, [path.join(forbiddenOwner, 'scripts/check-runtime-role-manifests.mjs')]).status, 0,
    'forbidden role package must fail');

  const collision = createFixture((fixture) => rewriteJson(path.join(fixture, 'packaging/runtime/package-ownership.json'), (value) => {
    value.packages.find((entry) => entry.id === 'telemetry-contract').bundle.target = 'skills/packages/plugin-foundation/registry';
  }));
  assert.notEqual(spawnSync(process.execPath, [path.join(collision, 'scripts/build-runtime-role-bundle.mjs'), 'nova', path.join(temporary, 'collision-output'), commit, 'v2', builtAt]).status, 0,
    'bundle target collision must fail');

  const changingSource = createMutableFixture();
  const preloader = path.join(changingSource, 'mutate-after-copy.mjs');
  const changedFile = path.join(changingSource, 'skills/common/plugin-runtime/sdk/src/index.ts');
  fs.writeFileSync(preloader, `
    import fs from 'node:fs';
    const original = fs.writeFileSync;
    let changed = false;
    fs.writeFileSync = function(file, ...args) {
      const result = original.call(this, file, ...args);
      if (!changed && String(file).endsWith('/skills/pipeline.ts')) {
        changed = true;
        fs.appendFileSync(${JSON.stringify(changedFile)}, '\\n');
      }
      return result;
    };
  `);
  assert.notEqual(spawnSync(process.execPath, [
    path.join(changingSource, 'scripts/build-runtime-role-bundle.mjs'),
    'nova', path.join(temporary, 'changing-source-output'), commit, 'v2', builtAt,
  ], {
    env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(preloader).href}` },
  }).status, 0, 'source changes after an early package copy must fail');
} finally {
  allowedServer.close();
  deniedServer.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '5.6-E', roles: 3, negativeProofs: 9 }));
