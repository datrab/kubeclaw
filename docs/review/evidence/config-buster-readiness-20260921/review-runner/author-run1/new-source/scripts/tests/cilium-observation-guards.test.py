#!/usr/bin/env python3
"""Synthetic CLI observations exercise real shell guards, never a live cluster."""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FAKE = '''#!/usr/bin/env python3
import json, os, sys, pathlib, yaml
command = [pathlib.Path(sys.argv[0]).name, *sys.argv[1:]]
with open(os.environ['CALLS'], 'a') as stream: stream.write(json.dumps(command)+'\\n')
f = json.loads(pathlib.Path(os.environ['OBSERVATIONS']).read_text())
a = command[1:]
if a == ['apply', '-f', '-']: sys.stdin.read()
if command[0] == 'k3s':
 print(json.dumps(f['pods'] if a[1] == 'pods' else f['inspection']))
elif a[:2] == ['get', 'nodes']: print(json.dumps(f['nodes']))
elif 'pods' in a: print(json.dumps({'items': [{'metadata': {'name': 'agent'}}]}))
elif 'exec' in a: print(json.dumps(f['endpoints']))
elif a[0] == 'get' and a[1] in ('NetworkPolicy', 'CiliumNetworkPolicy', 'CiliumClusterwideNetworkPolicy'):
 for filename in f['policies']:
  for obj in yaml.safe_load_all(pathlib.Path(filename).read_text()):
   if obj and obj['kind'] == a[1] and obj['metadata']['name'] == a[2]:
    print(json.dumps(obj)); sys.exit(0)
 sys.exit(9)
else: print('{}')
'''


def observation():
    return {'nodes': {'items': [{'spec': {'unschedulable': True}}]},
            'pods': {'items': [{'id': 'sandbox', 'state': 'SANDBOX_READY'}]},
            'inspection': {'status': {'id': 'sandbox', 'state': 'SANDBOX_READY',
                                      'linux': {'namespaces': {'options': {'network': 'NODE'}}}}},
            'endpoints': [{'id': 1, 'status': {'state': 'ready', 'policy': {
                'spec': {'policy-revision': 7}, 'realized': {'policy-revision': 7}}}}],
            'policies': [str(ROOT / 'my-values/infra/cilium-cluster-policies.yaml'),
                         str(ROOT / 'my-values/infra/network-policies.yaml')]}


class Guards(unittest.TestCase):
    def run_script(self, data, script='deploy-cilium.sh', mode='install'):
        with tempfile.TemporaryDirectory(prefix='cilium-fake-cli-') as temporary:
            directory = Path(temporary)
            for name in ('kubectl', 'helm', 'k3s'):
                file = directory / name
                file.write_text(FAKE)
                file.chmod(0o755)
            (directory / 'observations.json').write_text(json.dumps(data))
            calls = directory / 'calls.jsonl'
            env = {**os.environ, 'PATH': str(directory)+os.pathsep+os.environ['PATH'],
                   'OBSERVATIONS': str(directory / 'observations.json'), 'CALLS': str(calls),
                   'CILIUM_K3S_READY': 'true', 'CILIUM_DATAPLANE_VERIFIED': 'true',
                   'CILIUM_TRAFFIC_VERIFIED': 'true'}
            result = subprocess.run(['bash', str(ROOT / 'scripts' / script), mode],
                                    env=env, text=True, capture_output=True, timeout=30)
            commands = [json.loads(line) for line in calls.read_text().splitlines()]
            self.assertFalse(any('uncordon' in cmd or ('create' in cmd and 'configmap' in cmd)
                                 for cmd in commands), commands)
            return result, commands

    def assert_install_rejected(self, data):
        result, commands = self.run_script(data)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(any(cmd[0] == 'helm' or any(word in cmd for word in
                             ('create', 'apply', 'delete', 'rollout')) for cmd in commands), commands)

    def test_valid_install_observations_reach_chart(self):
        for mode in ('NODE', 2):
            data = observation()
            data['inspection']['status']['linux']['namespaces']['options']['network'] = mode
            result, calls = self.run_script(data)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(any(cmd[:3] == ['helm', 'upgrade', '--install'] for cmd in calls))
        for pods in ([], [{'id': 'stopped', 'state': 'SANDBOX_NOTREADY'}]):
            data = observation(); data['pods']['items'] = pods
            result, calls = self.run_script(data)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(any('inspectp' in cmd for cmd in calls))

    def test_bad_node_observations_prevent_mutation(self):
        for nodes in ({}, None, {'items': {}}, {'items': []},
                      {'items': [{}, {}]}, {'items': [{}]},
                      *({'items': [{'spec': {'unschedulable': value}}]}
                        for value in (False, 'false', 'true', 1, None))):
            with self.subTest(nodes=nodes):
                data = observation(); data['nodes'] = nodes; self.assert_install_rejected(data)

    def test_bad_cri_lists_prevent_mutation(self):
        for pods in ({}, None, {'items': {}}, {'items': [None]},
                     {'items': [{'id': 'sandbox'}]},
                     *({'items': [{'id': 'sandbox', 'state': value}]}
                       for value in ('UNKNOWN', 0, None)),
                     {'items': [{'id': '', 'state': 'SANDBOX_NOTREADY'}]},
                     {'items': [{'id': 'x', 'state': 'SANDBOX_NOTREADY'}] * 2}):
            with self.subTest(pods=pods):
                data = observation(); data['pods'] = pods; self.assert_install_rejected(data)

    def test_inconsistent_or_unknown_inspection_prevents_mutation(self):
        variants = [{}, {'status': {}}, {'status': {'id': 'other', 'state': 'SANDBOX_READY'}}]
        for mode in (None, False, True, '2', 0, 1, 'POD', 'UNKNOWN', 2.0):
            info = copy.deepcopy(observation()['inspection'])
            info['status']['linux']['namespaces']['options']['network'] = mode
            variants.append(info)
        info = copy.deepcopy(observation()['inspection']); info['status']['state'] = 'SANDBOX_NOTREADY'
        variants.append(info)
        for info in variants:
            with self.subTest(info=info):
                data = observation(); data['inspection'] = info; self.assert_install_rejected(data)

    def test_cleanup_requires_observed_endpoint_revisions(self):
        variants = [None, {}, []]
        for desired, realized in (({}, {}), ({'policy-revision': 7}, {}),
                                  ({'policy-revision': 7}, {'policy-revision': 6}),
                                  ({'policy-revision': True}, {'policy-revision': True}),
                                  ({'policy-revision': -1}, {'policy-revision': -1}),
                                  ({'policy-revision': '7'}, {'policy-revision': '7'})):
            variants.append([{'status': {'state': 'ready', 'policy': {'spec': desired, 'realized': realized}}}])
        for endpoints in variants:
            with self.subTest(endpoints=endpoints):
                data = observation(); data['endpoints'] = endpoints
                result, calls = self.run_script(data, 'migrate-kubeclaw-network-policies-to-cilium.sh', 'cleanup')
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertFalse(any('delete' in cmd for cmd in calls), calls)
        result, calls = self.run_script(observation(), 'migrate-kubeclaw-network-policies-to-cilium.sh', 'cleanup')
        self.assertEqual(result.returncode, 0, result.stderr)
        deletes = [cmd for cmd in calls if 'delete' in cmd]
        self.assertEqual(len(deletes), 13)
        self.assertFalse(any('kubeclaw-default-deny' in cmd or 'kubeclaw-agents-ingress' in cmd for cmd in deletes))


if __name__ == '__main__':
    unittest.main(verbosity=2)
