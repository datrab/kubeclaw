"""Pinned CLI and kernel observations for the supported legacy maintenance path."""
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import tempfile
import time
from buster_legacy_stop_policy import digest, require, trusted_path
from buster_legacy_stop_files import mount_identity, READ

BROWSER = '/sys/fs/cgroup/kubeclaw-buster-browser'
UNIT = Path('/etc/systemd/system/k3s.service')


def command(argv, seconds, maximum=1048576):
    def bounds():
        resource.setrlimit(resource.RLIMIT_FSIZE, (maximum, maximum))
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        process = subprocess.Popen(argv, stdout=out, stderr=err, stdin=subprocess.DEVNULL,
                                   start_new_session=True, preexec_fn=bounds)
        try:
            status = process.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise ValueError('BUSTER_LEGACY_STOP_COMMAND_TIMEOUT')
        require(out.tell() < maximum and err.tell() < maximum, 'COMMAND_OUTPUT_LIMIT')
        err.seek(0)
        require(status == 0, 'COMMAND_FAILED:' + str(argv[0]) + ':' + err.read(256).decode(errors='replace'))
        out.seek(0)
        return out.read(maximum).decode('utf-8')


def collection(value):
    require(isinstance(value, dict) and isinstance(value.get('items'), list), 'LIST_SHAPE')
    require(value.get('metadata', {}).get('continue', '') == '', 'LIST_INCOMPLETE')
    return value['items']


def uid_record(items, uid):
    matches = [row for row in items if row.get('metadata', {}).get('uid') == uid]
    require(len(matches) == 1, 'OBJECT_IDENTITY_REQUIRED')
    return matches[0]


def reference(row):
    meta = row['metadata']
    require(not meta.get('deletionTimestamp'), 'OBJECT_DELETING')
    return {key: meta.get(key) for key in ['uid', 'name', 'namespace', 'resourceVersion', 'generation']}


def process_identity(pid):
    require(type(pid) is int and pid > 1, 'PID_REQUIRED')
    raw = Path(f'/proc/{pid}/stat').read_text()
    start = int(raw[raw.rfind(')') + 2:].split()[19])
    return {'pid': pid, 'startTime': start}


def cgroup_identity(path):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path and str(path).startswith('/sys/fs/cgroup/'), 'CGROUP_PATH')
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        value = os.fstat(fd)
        events = (path / 'cgroup.events').read_text()
        require('populated ' in events and (path / 'cgroup.kill').is_file(), 'CGROUP_V2_REQUIRED')
        return {'path': str(path), 'device': value.st_dev, 'inode': value.st_ino}
    finally:
        os.close(fd)


def systemd(policy):
    text = command(['/bin/systemctl', 'show', 'k3s.service', '--property=Id,LoadState,ActiveState,SubState,FragmentPath,DropInPaths,MainPID'], policy['limits']['commandSeconds'])
    result = dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
    require(result.get('Id') == 'k3s.service' and result.get('DropInPaths') == '', 'UNIT_UNSUPPORTED')
    return result


def runtime_inventory(sandboxes, containers):
    def identities(rows, key):
        require(isinstance(rows, list), 'CRI_INVENTORY_SHAPE')
        result = []
        for row in rows:
            value = row.get(key)
            require(isinstance(value, str) and value and value not in result, 'CRI_IDENTITY')
            result.append(value)
        return sorted(result)
    return {'sandboxes': identities(sandboxes.get('items'), 'id'),
            'containers': identities(containers.get('containers'), 'id')}


def verify_stopped_runtime(policy, captured):
    cli = trusted_path(policy['k3sPath'])
    require('sha256:' + hashlib.sha256(cli.read_bytes()).hexdigest() == policy['k3sDigest'], 'CLI_CHANGED')
    prefix = [str(cli), 'crictl', '--runtime-endpoint', policy['runtimeEndpoint']]
    pods = json.loads(command([*prefix, 'pods', '-o', 'json'], policy['limits']['commandSeconds']))
    containers = json.loads(command([*prefix, 'ps', '-a', '-o', 'json'], policy['limits']['commandSeconds']))
    require(runtime_inventory(pods, containers) == captured['runtimeInventory'], 'RUNTIME_INVENTORY_CHANGED')


def capture(policy):
    volume = Path(policy['volumeRoot'])
    require(volume.resolve() == volume, 'VOLUME_SYMLINK')
    fd = os.open(volume, READ | os.O_DIRECTORY)
    try:
        require(mount_identity(fd)['filesystem'] == 'ext4', 'EXT4_REQUIRED')
    finally:
        os.close(fd)
    cli = trusted_path(policy['k3sPath'])
    require('sha256:' + hashlib.sha256(cli.read_bytes()).hexdigest() == policy['k3sDigest'], 'CLI_CHANGED')
    seconds = policy['limits']['commandSeconds']
    require(policy['k3sVersion'] == command([str(cli), '--version'], seconds).splitlines()[0], 'CLI_VERSION_CHANGED')
    def kubectl(kind, namespace=False):
        return json.loads(command([str(cli), 'kubectl', 'get', kind, *(['-n', policy['namespace']] if namespace else ['-A'] if kind == 'pods' else []), '-o', 'json'], seconds))
    def cri(*args):
        return json.loads(command([str(cli), 'crictl', '--runtime-endpoint', policy['runtimeEndpoint'], *args], seconds))
    nodes = collection(kubectl('nodes'))
    require(len(nodes) == 1, 'SINGLE_NODE_REQUIRED')
    node = uid_record(nodes, policy['nodeUid'])
    require(node['metadata']['name'] == policy['nodeName'], 'NODE_CHANGED')
    pvc = uid_record(collection(kubectl('pvc', True)), policy['pvcUid'])
    pv = uid_record(collection(kubectl('pv')), policy['pvUid'])
    require(pv['spec']['claimRef']['uid'] == policy['pvcUid'] and pvc['spec']['volumeName'] == pv['metadata']['name'], 'VOLUME_BINDING')
    require(pv['spec'].get('accessModes') == ['ReadWriteOnce'], 'VOLUME_MODE')
    backing = pv['spec'].get('local', pv['spec'].get('hostPath', {})).get('path')
    require(backing == policy['volumeRoot'], 'VOLUME_ROOT')
    deployment = uid_record(collection(kubectl('deployments', True)), policy['deploymentUid'])
    replicas = collection(kubectl('replicasets', True))
    replica_ids = {row['metadata']['uid'] for row in replicas if any(owner.get('uid') == policy['deploymentUid'] for owner in row['metadata'].get('ownerReferences', []))}
    consumers = []
    all_pods = collection(kubectl('pods'))
    for pod in all_pods:
        if pod['metadata'].get('namespace') == policy['namespace'] and any(volume.get('persistentVolumeClaim', {}).get('claimName') == pvc['metadata']['name'] for volume in pod['spec'].get('volumes', [])):
            require(pod['spec'].get('nodeName') == policy['nodeName'] and pod['status'].get('phase') == 'Running', 'POD_STATE')
            require(any(owner.get('uid') in replica_ids for owner in pod['metadata'].get('ownerReferences', [])), 'FOREIGN_CONSUMER')
            require(not pod['spec'].get('hostPID'), 'HOST_PID_UNSUPPORTED')
            require(any(v.get('hostPath', {}).get('path') == BROWSER for v in pod['spec'].get('volumes', [])), 'BROWSER_DELEGATION_REQUIRED')
            for container in pod['spec']['containers']:
                security = container.get('securityContext', {})
                require(not security.get('privileged'), 'PRIVILEGED_UNSUPPORTED')
                require(security.get('capabilities', {}).get('drop') == ['ALL'], 'CAP_BOUND_REQUIRED')
                allowed = {'CHOWN', 'KILL', 'SETGID', 'SETUID', 'SETPCAP'}
                require(set(security.get('capabilities', {}).get('add', [])) <= allowed, 'CAP_BOUND_UNSUPPORTED')
            consumers.append(pod)
    require(0 < len(consumers) <= policy['limits']['maximumContainers'], 'CONSUMERS_REQUIRED')
    consumer_ids = {pod['metadata']['uid'] for pod in consumers}
    for pod in all_pods:
        if any(v.get('hostPath', {}).get('path') == BROWSER for v in pod['spec'].get('volumes', [])):
            require(pod['metadata']['uid'] in consumer_ids, 'FOREIGN_BROWSER_CONSUMER')
    version = cri('version', '-o', 'json')
    require(version.get('runtimeName') == 'containerd' and version.get('runtimeVersion') == policy['runtimeVersion'], 'RUNTIME_CHANGED')
    cri_pods = cri('pods', '-o', 'json')
    require(isinstance(cri_pods.get('items'), list), 'CRI_PODS_SHAPE')
    containers = cri('ps', '-a', '-o', 'json')
    require(isinstance(containers.get('containers'), list), 'CRI_CONTAINERS_SHAPE')
    writers, groups = [], {BROWSER: cgroup_identity(BROWSER)}
    mounted_pods = set()
    for pod in consumers:
        sandbox = [row for row in cri_pods['items'] if row.get('labels', {}).get('io.kubernetes.pod.uid') == pod['metadata']['uid'] and row.get('state') == 'SANDBOX_READY']
        require(len(sandbox) == 1, 'SANDBOX_REQUIRED')
        sandbox_id = sandbox[0]['id']
        inspected_sandbox = cri('inspectp', sandbox_id)
        require(inspected_sandbox['status']['id'] == sandbox_id and inspected_sandbox['status']['state'] == 'SANDBOX_READY', 'SANDBOX_CHANGED')
        for row in containers['containers']:
            if row.get('podSandboxId') != sandbox_id:
                continue
            require(row.get('state') == 'CONTAINER_RUNNING', 'CONTAINER_STATE_UNSUPPORTED')
            detail = cri('inspect', row['id'])
            require(detail['status']['id'] == row['id'], 'CONTAINER_CHANGED')
            info = detail['info']; pid = info['pid']; process = process_identity(pid)
            capabilities = info['runtimeSpec']['process']['capabilities']
            allowed_caps = {'CAP_CHOWN', 'CAP_KILL', 'CAP_SETGID', 'CAP_SETUID', 'CAP_SETPCAP'}
            require(isinstance(capabilities.get('bounding'), list), 'RUNTIME_CAP_BOUND_REQUIRED')
            for field in ['bounding', 'effective', 'permitted', 'inheritable', 'ambient']:
                require(isinstance(capabilities.get(field, []), list) and set(capabilities.get(field, [])) <= allowed_caps, 'RUNTIME_CAP_BOUND_UNSUPPORTED')
            require(not any(item.get('type') == 'b' for item in info['runtimeSpec'].get('linux', {}).get('devices', [])), 'BLOCK_DEVICE_UNSUPPORTED')
            paths = Path(f'/proc/{pid}/cgroup').read_text().splitlines()
            require(len(paths) == 1 and paths[0].startswith('0::/'), 'CGROUP_LAYOUT_UNSUPPORTED')
            parent = Path('/sys/fs/cgroup' + paths[0][3:]).parent
            require(pod['metadata']['uid'].replace('-', '_') in parent.name or pod['metadata']['uid'] in parent.name, 'POD_CGROUP_BINDING')
            groups[str(parent)] = cgroup_identity(parent)
            mounts = info['runtimeSpec']['mounts']
            pvc_mounts = [m for m in mounts if m.get('destination') == '/var/lib/buster-v2']
            if pvc_mounts:
                mounted_pods.add(pod['metadata']['uid'])
                require(len(pvc_mounts) == 1, 'PVC_MOUNT_AMBIGUOUS')
                source = Path(pvc_mounts[0]['source']).stat()
                backing_stat = Path(policy['volumeRoot']).stat()
                require((source.st_dev, source.st_ino) == (backing_stat.st_dev, backing_stat.st_ino), 'PVC_MOUNT_CHANGED')
                require(any(m.get('destination') == '/var/run/kubeclaw-browser-cgroup' and m.get('source') == BROWSER for m in mounts), 'BROWSER_MOUNT_CHANGED')
            writers.append({'podUid': pod['metadata']['uid'], 'sandboxId': sandbox_id, 'containerId': row['id'], 'imageRef': detail['status']['imageRef'], **process})
    require(mounted_pods == consumer_ids, 'PVC_RUNTIME_MOUNT_REQUIRED')
    require(0 < len(writers) <= policy['limits']['maximumContainers'], 'WRITER_LIMIT')
    unit = systemd(policy)
    require(unit.get('LoadState') == 'loaded' and unit.get('ActiveState') == 'active' and unit.get('FragmentPath') == str(UNIT), 'UNIT_STATE')
    trusted_path(UNIT)
    require(UNIT.stat().st_size <= 65536, 'UNIT_SIZE')
    volume_stat = Path(policy['volumeRoot']).stat()
    return {'runtimeInventory': runtime_inventory(cri_pods, containers), 'volumeIdentity': {'device': volume_stat.st_dev, 'inode': volume_stat.st_ino}, 'node': reference(node), 'pvc': reference(pvc), 'pv': reference(pv), 'deployment': reference(deployment),
            'pods': [reference(pod) for pod in consumers], 'writers': writers, 'groups': list(groups.values()),
            'machineId': Path('/etc/machine-id').read_text().strip(), 'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'runtimeVersion': policy['runtimeVersion'], 'runtimeEndpoint': policy['runtimeEndpoint'],
            'unit': {'text': UNIT.read_text(), 'mode': UNIT.stat().st_mode & 0o777, 'properties': unit}, 'policyDigest': digest(policy)}


def drain(groups, seconds):
    # Open and validate the entire captured set before the first kill. All child
    # accesses remain relative to those held directory descriptors.
    held = []
    try:
        for expected in groups:
            require(cgroup_identity(expected['path']) == expected, 'CGROUP_REPLACED')
            fd = os.open(expected['path'], READ | os.O_DIRECTORY)
            held.append((expected, fd))
            value = os.fstat(fd)
            require((value.st_dev, value.st_ino) == (expected['device'], expected['inode']), 'CGROUP_REPLACED')
        deadline = time.monotonic() + seconds
        for expected, directory in held:
            fd = os.open('cgroup.kill', os.O_WRONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
            try:
                require(os.write(fd, b'1\n') == 2, 'KILL_WRITE_FAILED')
            finally:
                os.close(fd)
        for expected, directory in held:
            while True:
                require(cgroup_identity(expected['path']) == expected, 'CGROUP_CHANGED')
                fd = os.open('cgroup.events', READ, dir_fd=directory)
                try:
                    data = os.read(fd, 4097)
                    require(len(data) <= 4096, 'CGROUP_EVENTS_LIMIT')
                    events = dict(line.split() for line in data.decode().splitlines())
                finally:
                    os.close(fd)
                if events.get('populated') == '0':
                    break
                require(events.get('populated') == '1' and time.monotonic() < deadline, 'DRAIN_UNPROVEN')
                time.sleep(0.05)
    finally:
        for _, fd in held:
            os.close(fd)
