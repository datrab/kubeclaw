#!/usr/bin/python3
"""Render least-privilege observer RBAC; applies nothing. Pipe to kubectl explicitly."""
import argparse
import json
import re

parser = argparse.ArgumentParser()
parser.add_argument('--namespaces', default='kubeclaw,cilium,kube-system,argocd,tailscale,spire-server,spire-system')
args = parser.parse_args()
namespaces = args.namespaces.split(',')
if any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', n) for n in namespaces):
    parser.error('namespaces must be comma-separated DNS labels')

def resource(kind, name, **fields):
    return {'apiVersion': 'v1' if kind in ('Namespace', 'ServiceAccount') else 'rbac.authorization.k8s.io/v1',
            'kind': kind, 'metadata': {'name': name}, **fields}

ns = resource('Namespace', 'kubeclaw-ops')
ns['metadata']['labels'] = {'pod-security.kubernetes.io/enforce': 'restricted'}
sa = resource('ServiceAccount', 'external-ops', automountServiceAccountToken=False)
sa['metadata']['namespace'] = 'kubeclaw-ops'
groups = {
    '': ['pods', 'pods/log', 'services', 'events', 'persistentvolumeclaims'],
    'apps': ['deployments', 'statefulsets', 'daemonsets', 'replicasets'],
    'batch': ['jobs', 'cronjobs'],
    'networking.k8s.io': ['ingresses', 'networkpolicies'],
    'cilium.io': ['ciliumnetworkpolicies'],
    'argoproj.io': ['applications'],
}
role = resource('ClusterRole', 'kubeclaw-external-observer', rules=[
    {'apiGroups': [group], 'resources': resources, 'verbs': ['get', 'list']}
    for group, resources in groups.items()
])
items = [ns, sa, role]
cluster_role = resource('ClusterRole', 'kubeclaw-external-cluster-observer', rules=[
    {'apiGroups': [''], 'resources': ['nodes'], 'verbs': ['get', 'list']},
    {'apiGroups': ['cilium.io'], 'resources': ['ciliumclusterwidenetworkpolicies'], 'verbs': ['get', 'list']},
])
items.extend([cluster_role, resource('ClusterRoleBinding', 'kubeclaw-external-cluster-observer',
    roleRef={'apiGroup': 'rbac.authorization.k8s.io', 'kind': 'ClusterRole', 'name': cluster_role['metadata']['name']},
    subjects=[{'kind': 'ServiceAccount', 'name': 'external-ops', 'namespace': 'kubeclaw-ops'}])])
for namespace in dict.fromkeys(namespaces):
    binding = resource('RoleBinding', 'kubeclaw-external-observer',
                       roleRef={'apiGroup': 'rbac.authorization.k8s.io', 'kind': 'ClusterRole', 'name': role['metadata']['name']},
                       subjects=[{'kind': 'ServiceAccount', 'name': 'external-ops', 'namespace': 'kubeclaw-ops'}])
    binding['metadata']['namespace'] = namespace
    items.append(binding)
print(json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': items}, indent=2))
