import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const prismObservationRoot = '/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service/prism';

export const filesystemForDescriptor = fd => fs.statfsSync(`/proc/self/fd/${fd}`).type;

export function requirePrismObservationRepair(facts) {
  if (facts.uid !== 0 || facts.path !== prismObservationRoot || facts.realpath !== facts.path
    || facts.filesystem !== 0x63677270 || facts.owner !== 0 || facts.group !== 0
    || ![0o700, 0o711].includes(facts.mode) || facts.populated !== 'populated 0'
    || facts.children !== 0 || facts.processes !== '' || !facts.controlsRootOnlyWritable
    || !['cpu', 'memory', 'pids'].every(x => facts.controllers.includes(x))) {
    throw new Error('PRISM_OBSERVATION_REPAIR_PRECONDITION');
  }
  return facts.mode === 0o700;
}

/** Operator maintenance of one drained pool, never a runtime admission fallback. */
export function repairPrismObservationTraversal() {
  const root = prismObservationRoot;
  const fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    const files = ['cpu.max', 'memory.max', 'memory.swap.max', 'pids.max', 'cgroup.subtree_control'];
    const read = name => fs.readFileSync(`${root}/${name}`, 'utf8').trim();
    const before = Object.fromEntries(files.map(name => [name, read(name)]));
    const facts = {
      uid: process.getuid(), path: root, realpath: fs.realpathSync(root),
      filesystem: filesystemForDescriptor(fd), owner: stat.uid, group: stat.gid, mode: stat.mode & 0o777,
      populated: read('cgroup.events').split('\n').find(line => line.startsWith('populated ')),
      children: fs.readdirSync(root, {withFileTypes: true}).filter(x => x.isDirectory()).length,
      processes: read('cgroup.procs'), controllers: before['cgroup.subtree_control'].split(/\s+/u),
      controlsRootOnlyWritable: [...files, 'cgroup.procs'].every(name => {
        const entry = fs.statSync(`${root}/${name}`);
        return entry.uid === 0 && (entry.mode & 0o022) === 0;
      }),
    };
    const change = requirePrismObservationRepair(facts);
    // Add search only: no directory listing, writable controls, limits or ownership changes.
    if (change) fs.fchmodSync(fd, 0o711);
    const after = Object.fromEntries(files.map(name => [name, read(name)]));
    const current = fs.statSync(root);
    if (current.dev !== stat.dev || current.ino !== stat.ino || (current.mode & 0o777) !== 0o711
      || JSON.stringify(before) !== JSON.stringify(after)) throw new Error('PRISM_OBSERVATION_REPAIR_VERIFY');
    const result = {path: root, changed: change, from: facts.mode.toString(8), to: '711', controlsUnchanged: true};
    console.log(JSON.stringify(result));
    return result;
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) repairPrismObservationTraversal();
