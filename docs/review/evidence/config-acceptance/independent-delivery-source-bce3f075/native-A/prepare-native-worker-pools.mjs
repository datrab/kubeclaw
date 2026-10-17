import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = '/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service';
const read = file => fs.readFileSync(file, 'utf8').trim();
const required = ['cpu', 'memory', 'pids'];

function configuration(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size > 65536) throw new Error('NATIVE_SETUP_POLICY_NOT_TRUSTED');
    const policy = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (policy.schemaVersion !== 1 || policy.nodeVersion !== process.versions.node
      || Object.keys(policy.pools ?? {}).sort().join(',') !== 'buster,prism') throw new Error('NATIVE_SETUP_POLICY_RUNTIME_INVALID');
    for (const pool of Object.values(policy.pools)) validatePool(pool);
    return policy;
  } finally { fs.closeSync(fd); }
}

function validatePool(pool) {
  for (const key of ['memoryBytes', 'tasks', 'cpuQuotaMicroseconds', 'cpuPeriodMicroseconds']) {
    if (!Number.isSafeInteger(pool[key]) || pool[key] < 1) throw new Error('NATIVE_SETUP_LIMIT_INVALID');
  }
  if (pool.memoryBytes % 4096 || pool.cpuPeriodMicroseconds < 1000 || pool.cpuPeriodMicroseconds > 1000000
    || pool.cpuQuotaMicroseconds < 1000) throw new Error('NATIVE_SETUP_LIMIT_INVALID');
}

function controls(pool) {
  return { 'memory.max': String(pool.memoryBytes), 'memory.swap.max': '0',
    'pids.max': String(pool.tasks), 'cpu.max': `${pool.cpuQuotaMicroseconds} ${pool.cpuPeriodMicroseconds}` };
}

function verifyExisting(role, pool) {
  const directory = `${root}/${role}`;
  if (!fs.existsSync(directory)) return false;
  if (!fs.lstatSync(directory).isDirectory() || fs.statfsSync(directory).type !== 0x63677270
    || read(`${directory}/cgroup.procs`)) throw new Error('NATIVE_SETUP_EXISTING_POOL_INVALID');
  for (const [file, expected] of Object.entries(controls(pool))) {
    if (read(`${directory}/${file}`) !== expected) throw new Error('NATIVE_SETUP_POOL_CHANGE_REQUIRES_MAINTENANCE');
  }
  if (!required.every(controller => read(`${directory}/cgroup.subtree_control`).split(/\s+/).includes(controller))) {
    throw new Error('NATIVE_SETUP_EXISTING_POOL_NOT_DELEGATED');
  }
  return true;
}

function identity() {
  const machineId = read('/etc/machine-id');
  if (!/^[a-f0-9]{32}$/.test(machineId)) throw new Error('NATIVE_SETUP_MACHINE_ID_INVALID');
  const file = '/etc/kubeclaw/native-node-id';
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || read(file) !== machineId) throw new Error('NATIVE_SETUP_NODE_IDENTITY_CONFLICT');
    return;
  }
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o444);
  try { fs.writeFileSync(fd, `${machineId}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const parent = fs.openSync('/etc/kubeclaw', fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}

function runtimeIdentity() {
  const own = fs.statSync('/proc/self/ns/cgroup', { bigint: true });
  const host = fs.statSync('/proc/1/ns/cgroup', { bigint: true });
  if (own.dev !== host.dev || own.ino !== host.ino) throw new Error('NATIVE_SETUP_HOST_NAMESPACE_REQUIRED');
  const value = { schemaVersion: 1, bootId: read('/proc/sys/kernel/random/boot_id'),
    cgroupNamespace: { device: String(own.dev), inode: String(own.ino) } };
  const file = '/etc/kubeclaw/native-runtime-identity.json';
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size > 4096) throw new Error('NATIVE_SETUP_RUNTIME_IDENTITY_NOT_TRUSTED');
    const previous = JSON.parse(read(file));
    if (previous.bootId === value.bootId) {
      if (JSON.stringify(previous) !== JSON.stringify(value)) throw new Error('NATIVE_SETUP_RUNTIME_IDENTITY_CONFLICT');
      return;
    }
  }
  const temporary = `${file}.${process.pid}.pending`;
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o444);
  try { fs.writeFileSync(fd, `${JSON.stringify(value)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  const parent = fs.openSync('/etc/kubeclaw', fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}

function prepare(policy) {
  if (process.getuid() !== 0 || fs.statfsSync(root).type !== 0x63677270
    || !read('/proc/self/cgroup').split('\n').includes(`0::${root.slice('/sys/fs/cgroup'.length)}/setup`)
    || read(`${root}/cgroup.procs`)) throw new Error('NATIVE_SETUP_DELEGATED_UNIT_REQUIRED');
  const available = read(`${root}/cgroup.controllers`).split(/\s+/);
  if (!required.every(controller => available.includes(controller))) throw new Error('NATIVE_SETUP_CONTROLLERS_UNAVAILABLE');
  const unknown = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()
    && !['setup', 'buster', 'prism'].includes(entry.name));
  if (unknown.length) throw new Error('NATIVE_SETUP_UNKNOWN_SUBTREE');
  // Inspect all existing role limits before creating or changing anything.
  const existing = new Set(Object.entries(policy.pools).filter(([role, pool]) => verifyExisting(role, pool)).map(([role]) => role));
  identity();
  runtimeIdentity();
  fs.writeFileSync(`${root}/cgroup.subtree_control`, required.map(controller => `+${controller}`).join(' '));
  for (const [role, pool] of Object.entries(policy.pools)) {
    if (existing.has(role)) continue;
    const directory = `${root}/${role}`;
    fs.mkdirSync(directory);
    for (const [file, value] of Object.entries(controls(pool))) fs.writeFileSync(`${directory}/${file}`, value);
    fs.writeFileSync(`${directory}/cgroup.subtree_control`, required.map(controller => `+${controller}`).join(' '));
    verifyExisting(role, pool);
  }
  prepareBrowser();
  process.stdout.write('NATIVE_HOST_POOLS_PREPARED_NODE_CAPACITY_PREFLIGHT_REQUIRED\n');
}

function prepareBrowser() {
  // Browser delegation must never chown the role pool itself: its limits and
  // ownership belong to the host. Descendants remain bounded by that pool.
  const browser = `${root}/buster/browser`;
  if (!fs.existsSync(browser)) fs.mkdirSync(browser);
  if (fs.lstatSync(browser).isSymbolicLink() || fs.statfsSync(browser).type !== 0x63677270
    || read(`${browser}/cgroup.procs`)) throw new Error('NATIVE_BROWSER_SUBTREE_INVALID');
  fs.writeFileSync(`${browser}/cgroup.subtree_control`, required.map(controller => `+${controller}`).join(' '));
}

export function requireRunningPoolService(facts) {
  if (facts.uid !== 0 || facts.subState !== 'running'
    || facts.controlGroup !== root.slice('/sys/fs/cgroup'.length)
    || !Number.isSafeInteger(facts.mainPid) || facts.mainPid <= 0
    || !facts.mainCgroup.split('\n').includes(`0::${root.slice('/sys/fs/cgroup'.length)}/setup`)
    || !facts.hostNamespaceMatches) throw new Error('NATIVE_BROWSER_RUNNING_POOL_REQUIRED');
}

function prepareBrowserOnly(policy) {
  const show = key => execFileSync('systemctl', ['show', 'kubeclaw-native-pools.service', '-p', key, '--value'], {encoding:'utf8'}).trim();
  const mainPid = Number(show('MainPID'));
  if (!Number.isSafeInteger(mainPid) || mainPid <= 0) throw new Error('NATIVE_BROWSER_RUNNING_POOL_REQUIRED');
  const own = fs.statSync('/proc/self/ns/cgroup', {bigint:true});
  const host = fs.statSync('/proc/1/ns/cgroup', {bigint:true});
  requireRunningPoolService({uid:process.getuid(), subState:show('SubState'), controlGroup:show('ControlGroup'),
    mainPid, mainCgroup:read(`/proc/${mainPid}/cgroup`), hostNamespaceMatches:own.dev===host.dev && own.ino===host.ino});
  // Never call prepare(): an administrator shell is intentionally not inside
  // the service's setup subgroup. Inspect existing pools without rewriting them.
  if (fs.statfsSync(root).type !== 0x63677270 || fs.realpathSync(root)!==root
    || read(`${root}/cgroup.procs`)) throw new Error('NATIVE_BROWSER_RUNNING_POOL_REQUIRED');
  for (const [role,pool] of Object.entries(policy.pools)) {
    if (!verifyExisting(role,pool)) throw new Error('NATIVE_BROWSER_EXISTING_POOL_REQUIRED');
  }
  prepareBrowser();
  process.stdout.write('NATIVE_BROWSER_SUBTREE_PREPARED_EXISTING_POOLS_UNCHANGED\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
const serve = process.argv.length === 4 && process.argv[3] === '--serve';
const browserOnly = process.argv.length === 4 && process.argv[3] === '--browser-only';
if (process.argv.length !== 3 && !serve && !browserOnly) throw new Error('Usage: prepare-native-worker-pools.mjs ROOT_OWNED_GENERATED_POLICY_JSON [--serve|--browser-only]');
const selected = configuration(process.argv[2]);
if (browserOnly) prepareBrowserOnly(selected);
else prepare(selected);
if (serve) {
  // RemainAfterExit retains the unit state, not an empty delegated cgroup.
  // Keep the setup subgroup populated for the entire pool lifetime. Notify only
  // after both pools and their identities have been successfully verified.
  execFileSync('/usr/bin/systemd-notify', ['--ready', '--status=Native worker pools prepared; capacity preflight still required'], { stdio: 'inherit' });
  setInterval(() => {}, 60_000);
}
}
