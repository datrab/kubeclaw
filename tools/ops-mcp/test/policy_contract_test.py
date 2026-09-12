import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch, mock_open
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[3]


def policies(name):
    return {d['metadata']['name']: d for d in yaml.safe_load_all((ROOT / 'my-values/infra' / name).read_text()) if d}


class PolicyContract(unittest.TestCase):
    def test_baseline_and_paperless_exception(self):
        docs = policies('cilium-cluster-policies.yaml')
        deny = docs['dtlabs-workload-default-deny']['spec']
        self.assertEqual(deny['ingress'], [])
        self.assertEqual(deny['egress'], [])
        self.assertEqual(deny['enableDefaultDeny'], {'ingress': True, 'egress': True})
        excluded = deny['endpointSelector']['matchExpressions'][0]['values']
        self.assertEqual(set(excluded), {'kube-system', 'cilium', 'tailscale', 'argocd', 'paperless'})
        self.assertEqual(deny['endpointSelector'], docs['dtlabs-workload-allow-dns']['spec']['endpointSelector'])
        self.assertEqual(docs['hubble-ui-private']['spec']['ingress'], [])

    def test_api_clients_and_same_namespace_contract(self):
        docs = policies('network-policies.yaml')
        controller = docs['kubeclaw-buster-namespace-controller-api-egress']['spec']
        self.assertEqual(controller['endpointSelector']['matchLabels']['app.kubernetes.io/component'], 'buster-namespace-controller')
        self.assertEqual({p['port'] for p in controller['egress'][0]['toPorts'][0]['ports']}, {'443', '6443'})
        clients = docs['kubeclaw-lease-clients-api-egress']['spec']['endpointSelector']['matchExpressions'][0]['values']
        self.assertEqual(set(clients), {'nova', 'buster'})
        ingress = docs['kubeclaw-agents-ingress']
        self.assertEqual(ingress['kind'], 'NetworkPolicy')
        self.assertEqual(ingress['spec']['ingress'][0]['from'], [{'podSelector': {}}])
        self.assertNotIn('fromEntities', docs['kubeclaw-litellm-ingress']['spec']['ingress'][0])

    def test_cleanup_drift_fails_before_enforcement_claim(self):
        path = ROOT / 'scripts/verify-cilium-policies.py'
        spec = importlib.util.spec_from_file_location('verify_policy', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        desired = '{"kind":"CiliumNetworkPolicy","metadata":{"name":"test","namespace":"example"},"spec":{"ingress":[]}}'
        live = '{"spec":{"ingress":[{}]}}'
        with patch.object(module, 'run', side_effect=[desired, live]), patch.object(module.yaml, 'safe_load_all', return_value=[json.loads(desired)]), patch('builtins.open', mock_open(read_data='')):
            with self.assertRaisesRegex(RuntimeError, 'Policy drift'):
                module.verify('example', ['desired.yaml'])

    def test_example_allows_both_sides(self):
        docs = list(yaml.safe_load_all((ROOT / 'examples/cilium/project-network-policy.yaml').read_text()))
        self.assertIn('egress', docs[1]['spec'])
        self.assertIn('ingress', docs[1]['spec'])


if __name__ == '__main__':
    unittest.main()
