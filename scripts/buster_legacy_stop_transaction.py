"""External maintenance transaction. CLI guards precede every host mutation."""
import json
import os
from pathlib import Path
import uuid
from buster_legacy_stop_policy import digest, encode, require, trusted_path
from buster_legacy_stop_files import (acquire_original_locks, atomic_bytes, ensure_directory,
                                    inode, plan_tree, seal_tree, sync_directory)
from buster_legacy_stop_runtime import UNIT, capture, command, drain, process_identity, systemd, verify_stopped_runtime

STATE_ROOT = Path('/var/lib/kubeclaw/buster-legacy-migration')


def save(path, state, maximum):
    data = encode(state) + b'\n'
    retained = sum(entry.stat().st_size for entry in path.iterdir())
    require(retained + len(data) <= maximum, 'TRANSACTION_TOTAL_QUOTA')
    atomic_bytes(path / 'state.json', data, maximum)


def reserve_completion(state, limits):
    # Both old and replacement state/receipt can coexist during atomic writes.
    # The receipt has a separately enforced encoded-byte ceiling. Null occupies
    # four bytes in this exact prospective state framing.
    prospective = dict(state, phase='completed', receipt=None)
    maximum_state = len(encode(prospective)) + 1 - 4 + limits['maximumReceiptBytes']
    require(2 * maximum_state + 2 * limits['maximumReceiptBytes']
            <= limits['maximumTransactionBytes'], 'TERMINAL_METADATA_CAPACITY')


def check_boot(captured):
    require(Path('/proc/sys/kernel/random/boot_id').read_text().strip() == captured['bootId'], 'BOOT_CHANGED')
    require(Path('/etc/machine-id').read_text().strip() == captured['machineId'], 'NODE_CHANGED')


def mask_unit(captured):
    if UNIT.is_symlink():
        require(os.readlink(UNIT) == '/dev/null', 'UNIT_MASK_CHANGED')
        return
    trusted_path(UNIT)
    require(UNIT.read_text() == captured['unit']['text'], 'UNIT_CHANGED')
    temporary = UNIT.with_name(UNIT.name + '.buster-mask')
    if temporary.is_symlink():
        require(os.readlink(temporary) == '/dev/null' and temporary.lstat().st_uid == 0, 'UNIT_MASK_SCRATCH_CHANGED')
        temporary.unlink()
        sync_directory(UNIT.parent)
    else:
        require(not temporary.exists(), 'UNIT_MASK_SCRATCH_CHANGED')
    os.symlink('/dev/null', temporary)
    os.replace(temporary, UNIT)
    sync_directory(UNIT.parent)


def restore_unit(captured, seconds):
    if UNIT.is_symlink():
        require(os.readlink(UNIT) == '/dev/null', 'UNIT_MASK_CHANGED')
        atomic_bytes(UNIT, captured['unit']['text'].encode(), 65536, captured['unit']['mode'])
    else:
        trusted_path(UNIT)
        require(UNIT.read_text() == captured['unit']['text'], 'RESTORED_UNIT_CHANGED')
    command(['/bin/systemctl', 'daemon-reload'], seconds)


def verify_tree(root, kind, limits):
    verifier = Path(__file__).with_name('buster-legacy-store-verify.py').resolve()
    trusted_path(verifier)
    output = command(['/usr/bin/setpriv', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all',
                      '--no-new-privs', '/usr/bin/python3', str(verifier), '--root', str(root), '--kind', kind,
                      '--maximum-bytes', str(limits['maximumBytes']), '--maximum-entries', str(limits['maximumEntries'])],
                     limits['commandSeconds'], limits['maximumReceiptBytes'])
    observation = json.loads(output)
    expected = 'buster-legacy-immutable-tree.v1' if kind == 'plan' else 'buster-legacy-immutable-runtime.v1'
    require(observation.get('schemaVersion') == expected, 'VERIFIER_SCHEMA')
    filesystem_uuid = observation.get('filesystemUuid')
    require(isinstance(filesystem_uuid, str) and str(uuid.UUID(filesystem_uuid)) == filesystem_uuid
            and uuid.UUID(filesystem_uuid).int != 0, 'VERIFIER_FILESYSTEM_UUID')
    return observation


def publish(volume, transaction_id, data, maximum):
    directory = ensure_directory(volume / 'legacy-migration')
    require(set(os.listdir(directory)) <= {transaction_id}, 'RECEIPT_NAMESPACE_CONFLICT')
    transaction = ensure_directory(directory / transaction_id)
    require(set(os.listdir(transaction)) <= {'receipt.json'}, 'RECEIPT_NAMESPACE_CONFLICT')
    receipt = transaction / 'receipt.json'
    if receipt.exists():
        trusted_path(receipt)
        require(receipt.read_bytes() == data, 'RECEIPT_CONFLICT')
    else:
        atomic_bytes(receipt, data, maximum, 0o640)
    planned = plan_tree(directory, {'maximumBytes': maximum, 'maximumEntries': 4})
    seal_tree(directory, planned)
    require(receipt.read_bytes() == data, 'RECEIPT_CHANGED')
    return str(receipt)


def same_seal(current, sealed):
    # Mount IDs belong to the current namespace, not the durable volume identity.
    def stable(value):
        if isinstance(value, dict):
            return {k: stable(v) for k, v in value.items() if k not in ['mountId', 'device']}
        if isinstance(value, list):
            return [stable(v) for v in value]
        return value
    return stable(current) == stable(sealed)


def receipt_identity(state, policy):
    captured = state['capture']
    return {'schemaVersion': 'buster-legacy-stop-seal.v1', 'transactionId': state['transactionId'],
            'policyDigest': digest(policy), 'captureDigest': digest(captured), 'node': captured['node'],
            'machineId': captured['machineId'], 'bootId': captured['bootId'], 'pvc': captured['pvc'], 'pv': captured['pv'],
            'deployment': captured['deployment'], 'writers': captured['writers'], 'quiescentGroups': captured['groups'],
            'runtimeVersion': captured['runtimeVersion'], 'runtimeEndpoint': captured['runtimeEndpoint'],
            'unitDigest': digest(captured['unit']), 'locks': state['locks'],
            'createdLockEntries': state['createdLockEntries']}


def complete(path, state, policy):
    limits = policy['limits']; captured = state['capture']; volume = Path(policy['volumeRoot'])
    plan_root, runtime_root = volume / 'plan-jobs', volume / 'runs'
    if state['phase'] == 'completed':
        receipt = state['receipt']
        # Completed state is not a license to reuse a foreign transaction's
        # receipt. Bind the retained bytes before tree readback or host action.
        require(isinstance(receipt, dict)
                and set(receipt) == set(receipt_identity(state, policy)) | {'plan', 'runtime', 'receiptDigest'}
                and all(receipt[key] == value for key, value in receipt_identity(state, policy).items())
                and receipt.get('receiptDigest') == digest({key: value for key, value in receipt.items()
                                                           if key != 'receiptDigest'}), 'TERMINAL_RECEIPT_CHANGED')
        require(same_seal(verify_tree(plan_root, 'plan', limits), receipt['plan']), 'PLAN_SEAL_CHANGED')
        require(same_seal(verify_tree(runtime_root, 'runtime', limits), receipt['runtime']), 'RUNTIME_SEAL_CHANGED')
        publish(volume, state['transactionId'], encode(receipt) + b'\n', limits['maximumReceiptBytes'])
        restore_unit(captured, limits['commandSeconds'])
        return receipt
    check_boot(captured)
    mask_unit(captured)
    command(['/bin/systemctl', 'daemon-reload'], limits['commandSeconds'])
    require(systemd(policy).get('LoadState') == 'masked', 'RESTART_FENCE_UNPROVEN')
    state['phase'] = 'restart-fenced'
    save(path, state, limits['maximumTransactionBytes'])
    command(['/bin/systemctl', 'stop', 'k3s.service'], limits['commandSeconds'])
    require(systemd(policy).get('ActiveState') == 'inactive', 'SERVICE_STILL_ACTIVE')
    verify_stopped_runtime(policy, captured)
    drain(captured['groups'], limits['drainSeconds'])
    for writer in captured['writers']:
        try:
            require(process_identity(writer['pid'])['startTime'] != writer['startTime'], 'WRITER_STILL_ALIVE')
        except FileNotFoundError:
            pass
    state['phase'] = 'writers-quiescent'
    save(path, state, limits['maximumTransactionBytes'])
    volume_stat = volume.stat()
    require({'device': volume_stat.st_dev, 'inode': volume_stat.st_ino} == captured['volumeIdentity'], 'VOLUME_REPLACED')
    os.chown(volume, 0, 0)
    os.chmod(volume, 0o755)
    handles, created = acquire_original_locks(plan_root, limits['commandSeconds'])
    created = sorted(set(state.get('createdLockEntries', [])) | set(created))
    try:
        plan = plan_tree(plan_root, limits); runtime = plan_tree(runtime_root, limits, inert_links=True)
        require(plan['bytes'] + runtime['bytes'] <= limits['maximumBytes']
                and plan['entries'] + runtime['entries'] <= limits['maximumEntries'], 'AGGREGATE_TREE_QUOTA')
        trees = {'plan': plan, 'runtime': runtime}
        if 'trees' in state:
            require(state['trees'] == trees, 'PARTIAL_TREE_CHANGED')
        state.update(phase='sealing', trees=trees, createdLockEntries=created,
                     locks=[inode(fd) for fd in handles])
        reserve_completion(state, limits)
        save(path, state, limits['maximumTransactionBytes'])
        seal_tree(plan_root, plan); seal_tree(runtime_root, runtime)
        receipt = dict(receipt_identity(state, policy),
                       plan=verify_tree(plan_root, 'plan', limits), runtime=verify_tree(runtime_root, 'runtime', limits))
        receipt['receiptDigest'] = digest(receipt)
        data = encode(receipt) + b'\n'
        require(len(data) <= limits['maximumReceiptBytes'], 'RECEIPT_QUOTA')
        atomic_bytes(path / 'receipt.json', data, limits['maximumReceiptBytes'])
        publish(volume, state['transactionId'], data, limits['maximumReceiptBytes'])
        state.update(phase='completed', receipt=receipt)
        save(path, state, limits['maximumTransactionBytes'])
    finally:
        for fd in handles:
            os.close(fd)
    restore_unit(captured, limits['commandSeconds'])
    return receipt


def begin(policy, expected_capture):
    current = capture(policy)
    require(current == expected_capture, 'CAPTURE_STALE')
    directory = ensure_directory(STATE_ROOT)
    transaction_id = str(uuid.uuid4())
    path = ensure_directory(directory / transaction_id)
    state = {'schemaVersion': 'buster-legacy-stop-transaction.v1', 'transactionId': transaction_id,
             'policy': policy, 'capture': current, 'phase': 'captured'}
    save(path, state, policy['limits']['maximumTransactionBytes'])
    return complete(path, state, policy)


def resume(transaction_id, policy):
    require(str(uuid.UUID(transaction_id)) == transaction_id, 'TRANSACTION_ID')
    path = trusted_path(STATE_ROOT / transaction_id, directory=True)
    file = trusted_path(path / 'state.json')
    require(file.stat().st_size <= policy['limits']['maximumTransactionBytes'], 'TRANSACTION_QUOTA')
    state = json.loads(file.read_text())
    require(state['policy'] == policy and state['transactionId'] == transaction_id
            and state['schemaVersion'] == 'buster-legacy-stop-transaction.v1', 'TRANSACTION_CHANGED')
    require(state['phase'] in ['captured', 'restart-fenced', 'writers-quiescent', 'sealing', 'completed'], 'TRANSACTION_PHASE')
    return complete(path, state, policy)
