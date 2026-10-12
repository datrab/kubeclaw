"""Unprivileged real-filesystem/protocol tests; no stop, flags or host actions."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from buster_legacy_stop_policy import validate_policy
from buster_legacy_stop_files import acquire_original_locks, atomic_bytes, plan_tree
from buster_legacy_stop_runtime import collection, command, runtime_inventory
from buster_legacy_stop_transaction import same_seal, reserve_completion
import buster_legacy_stop_transaction as transaction


def policy():
    return {'schemaVersion': 'buster-legacy-stop-policy.v1', 'namespace': 'buster',
            'deploymentUid': 'a', 'pvcUid': 'b', 'pvUid': 'c', 'nodeUid': 'd', 'nodeName': 'node',
            'volumeRoot': '/var/lib/rancher/k3s/storage/pvc-b', 'k3sPath': '/usr/local/bin/k3s',
            'k3sDigest': 'sha256:' + '1' * 64, 'k3sVersion': 'k3s version fixture',
            'runtimeVersion': 'fixture', 'runtimeEndpoint': 'unix:///run/k3s/containerd/containerd.sock',
            'limits': {'maximumBytes': 1000000, 'maximumEntries': 1000, 'maximumContainers': 16,
                       'maximumReceiptBytes': 65536, 'maximumTransactionBytes': 1048576,
                       'commandSeconds': 1, 'drainSeconds': 1}}


class StopProducerTests(unittest.TestCase):
    def test_strict_policy_and_numeric_bounds(self):
        self.assertEqual(validate_policy(policy()), policy())
        for mutation in ['extra', 'boolean', 'endpoint', 'negative']:
            value = policy()
            if mutation == 'extra': value['stopped'] = True
            if mutation == 'boolean': value['limits']['maximumEntries'] = True
            if mutation == 'endpoint': value['runtimeEndpoint'] = '/arbitrary'
            if mutation == 'negative': value['limits']['drainSeconds'] = -1
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_policy(value)

    def test_status_before_json_stdout(self):
        with self.assertRaisesRegex(ValueError, 'COMMAND_FAILED'):
            command([sys.executable, '-c', 'print("{}",flush=True);raise SystemExit(1)'], 1)

    def test_actual_child_output_ceiling(self):
        with self.assertRaisesRegex(ValueError, 'COMMAND_FAILED|COMMAND_OUTPUT_LIMIT'):
            command([sys.executable, '-c', 'import os;os.write(1,b"x"*8192)'], 1, 1024)

    def test_incomplete_lists_rejected(self):
        for value in [{}, {'items': None}, {'items': [], 'metadata': {'continue': 'next'}}]:
            with self.assertRaises(ValueError): collection(value)

    def test_complete_runtime_inventory_rejects_duplicates_and_missing_ids(self):
        self.assertEqual(runtime_inventory({'items': [{'id': 'b'}, {'id': 'a'}]},
                                          {'containers': [{'id': 'c'}]}),
                         {'sandboxes': ['a', 'b'], 'containers': ['c']})
        for rows in [None, [{}], [{'id': 'a'}, {'id': 'a'}]]:
            with self.assertRaises(ValueError):
                runtime_inventory({'items': rows}, {'containers': []})

    def test_lazy_locks_created_without_replacing_existing_inode(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'records').mkdir()
            existing = root / '.write-lock'; existing.write_bytes(b'original')
            before = existing.stat().st_ino
            handles, created = acquire_original_locks(root, 1)
            try:
                self.assertEqual(existing.stat().st_ino, before)
                self.assertEqual(existing.read_bytes(), b'original')
                self.assertEqual(created, ['records/.write-lock', 'results', 'results/.write-lock'])
            finally:
                for fd in handles: os.close(fd)
            handles, created = acquire_original_locks(root, 1)
            self.assertEqual(created, [])
            for fd in handles: os.close(fd)

    def test_existing_lock_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'records').mkdir(); (root / 'outside').write_text('sentinel')
            (root / '.write-lock').symlink_to('outside')
            with self.assertRaises(OSError): acquire_original_locks(root, 1)
            self.assertEqual((root / 'outside').read_text(), 'sentinel')

    def test_tree_limits_and_link_rejection_preserve_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'file').write_bytes(b'abc')
            self.assertEqual(plan_tree(root, {'maximumEntries': 2, 'maximumBytes': 3})['bytes'], 3)
            with self.assertRaisesRegex(ValueError, 'BYTE_QUOTA'):
                plan_tree(root, {'maximumEntries': 2, 'maximumBytes': 2})
            (root / 'link').symlink_to('file')
            with self.assertRaisesRegex(ValueError, 'TREE_ENTRY_UNSUPPORTED'):
                plan_tree(root, {'maximumEntries': 3, 'maximumBytes': 100})
            self.assertEqual((root / 'file').read_bytes(), b'abc')

    def test_runtime_links_are_inert_and_charged_without_reading_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'runs'; root.mkdir()
            outside = Path(directory) / 'outside'; outside.write_bytes(b'sentinel')
            (root / 'node_modules').symlink_to('../outside')
            (root / 'missing').symlink_to('/missing/target')
            total = len('../outside') + len('/missing/target')
            result = plan_tree(root, {'maximumEntries': 3, 'maximumBytes': total}, inert_links=True)
            self.assertEqual(result['bytes'], total)
            self.assertEqual([r['linkTarget'] for r in result['rows'] if 'linkTarget' in r],
                             ['/missing/target', '../outside'])
            self.assertEqual(outside.read_bytes(), b'sentinel')
            with self.assertRaisesRegex(ValueError, 'BYTE_QUOTA'):
                plan_tree(root, {'maximumEntries': 3, 'maximumBytes': total - 1}, inert_links=True)

    def test_atomic_quota_rejection_does_not_replace_record(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state'; atomic_bytes(path, b'old', 3)
            before = path.stat().st_ino
            with self.assertRaisesRegex(ValueError, 'METADATA_QUOTA'): atomic_bytes(path, b'longer', 3)
            self.assertEqual(path.read_bytes(), b'old'); self.assertEqual(path.stat().st_ino, before)

    def test_abandoned_private_scratch_recovery_preserves_committed_record(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state'; path.write_bytes(b'committed')
            scratch = Path(directory) / 'state.new'; scratch.write_bytes(b'partial'); scratch.chmod(0o600)
            atomic_bytes(path, b'next', 20)
            self.assertEqual(path.read_bytes(), b'next')
            scratch.symlink_to(path)
            with self.assertRaisesRegex(ValueError, 'SCRATCH_UNTRUSTED'):
                atomic_bytes(path, b'bad', 20)
            self.assertEqual(path.read_bytes(), b'next')

    def test_terminal_metadata_reservation_exact_bound(self):
        state = {'phase': 'sealing', 'trees': {'plan': {'entries': 2}}}
        maximum_receipt = 100
        encoded = json.dumps(dict(state, phase='completed', receipt=None), sort_keys=True, separators=(',', ':')).encode()
        boundary = 2 * (len(encoded) + 1 - 4 + maximum_receipt) + 2 * maximum_receipt
        reserve_completion(state, {'maximumReceiptBytes': maximum_receipt, 'maximumTransactionBytes': boundary})
        with self.assertRaisesRegex(ValueError, 'TERMINAL_METADATA_CAPACITY'):
            reserve_completion(state, {'maximumReceiptBytes': maximum_receipt, 'maximumTransactionBytes': boundary - 1})

    def test_mount_id_is_traversal_local_but_digest_remains_bound(self):
        self.assertTrue(same_seal({'mountId': 1, 'digest': 'a'}, {'mountId': 2, 'digest': 'a'}))
        self.assertFalse(same_seal({'mountId': 1, 'digest': 'b'}, {'mountId': 2, 'digest': 'a'}))

    def test_cli_unprivileged_rejection_without_host_calls(self):
        self.assertNotEqual(os.geteuid(), 0, 'this suite must stay unprivileged')
        result = subprocess.run([sys.executable, 'scripts/buster-legacy-stop.py', 'seal', '--policy', '/nonexistent'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('HOST_ROOT_REQUIRED', result.stderr)
        self.assertEqual(result.stdout, '')

    def completed_fixture(self):
        # Explicit protocol fixtures: these are not kernel observations or stop proof.
        plan = {'mountId': 1, 'device': 2, 'inode': 3, 'inventoryDigest': 'plan',
                'store': {'device': 2, 'inode': 4, 'bytes': 5, 'digest': 'store'}}
        runtime = {'mountId': 1, 'device': 2, 'inode': 6, 'inventoryDigest': 'runtime'}
        return {'phase': 'completed', 'transactionId': 'fixture', 'capture': {},
                'receipt': {'plan': plan, 'runtime': runtime}}

    def test_completed_replaced_store_rejected_before_publication(self):
        state = self.completed_fixture()
        current = copy.deepcopy(state['receipt']['plan'])
        current['store']['inode'] += 1
        with patch.object(transaction, 'verify_tree', return_value=current) as verify, \
                patch.object(transaction, 'publish') as publish, \
                patch.object(transaction, 'restore_unit') as restore:
            with self.assertRaisesRegex(ValueError, '^BUSTER_LEGACY_STOP_PLAN_SEAL_CHANGED$'):
                transaction.complete(Path('/unused'), state, policy())
            self.assertEqual(verify.call_count, 1)
            self.assertEqual(verify.call_args.args[1], 'plan')
            publish.assert_not_called()
            restore.assert_not_called()

    def test_completed_changed_runtime_rejected_before_publication(self):
        state = self.completed_fixture()
        current = copy.deepcopy(state['receipt']['runtime'])
        current['inventoryDigest'] = 'changed-runtime'
        with patch.object(transaction, 'verify_tree', side_effect=[state['receipt']['plan'], current]) as verify, \
                patch.object(transaction, 'publish') as publish, \
                patch.object(transaction, 'restore_unit') as restore:
            with self.assertRaisesRegex(ValueError, '^BUSTER_LEGACY_STOP_RUNTIME_SEAL_CHANGED$'):
                transaction.complete(Path('/unused'), state, policy())
            self.assertEqual([call.args[1] for call in verify.call_args_list], ['plan', 'runtime'])
            publish.assert_not_called()
            restore.assert_not_called()

    def test_completed_matching_receipt_published_before_restore(self):
        state = self.completed_fixture()
        current = copy.deepcopy(state['receipt'])
        for observation in current.values():
            observation.update(mountId=101, device=102)
        current['plan']['store']['device'] = 102
        calls = []
        with patch.object(transaction, 'verify_tree', side_effect=[current['plan'], current['runtime']]) as verify, \
                patch.object(transaction, 'publish', side_effect=lambda *args: calls.append(('publish', args))), \
                patch.object(transaction, 'restore_unit', side_effect=lambda *args: calls.append(('restore', args))):
            self.assertIs(transaction.complete(Path('/unused'), state, policy()), state['receipt'])
        self.assertEqual([call.args[1] for call in verify.call_args_list], ['plan', 'runtime'])
        self.assertEqual(calls, [
            ('publish', (Path(policy()['volumeRoot']), 'fixture',
                         transaction.encode(state['receipt']) + b'\n', policy()['limits']['maximumReceiptBytes'])),
            ('restore', (state['capture'], policy()['limits']['commandSeconds'])),
        ])


if __name__ == '__main__':
    unittest.main()
