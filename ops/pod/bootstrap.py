#!/usr/bin/env python3
"""Operator-side discovery and credential setup; never prints secret values."""
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

context = os.environ['KUBE_CONTEXT']
namespace = os.environ.get('OPS_NAMESPACE', 'kubeclaw-ops')
base = ['kubectl', '--context', context, '--request-timeout=20s']

def kube(args, data=None):
    result = subprocess.run(base + args, input=data, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # stderr from Secret apply can contain the submitted object. Never echo it.
        raise SystemExit('kubectl failed during Ops Pod setup; check context, permissions and named resource availability')
    return result.stdout

def get(kind, name, ns=None):
    args = ['get', kind, name, '--ignore-not-found', '-o', 'json']
    if ns:
        args += ['-n', ns]
    text = kube(args).strip()
    return json.loads(text) if text else None

def apply_secret(name, values):
    kube(['apply', '-f', '-'], json.dumps({'apiVersion': 'v1', 'kind': 'Secret',
         'metadata': {'name': name, 'namespace': namespace}, 'type': 'Opaque', 'stringData': values}))

def discover():
    endpoints = get('endpoints', 'kubernetes', 'default')
    service = get('service', 'kubernetes', 'default')
    if not endpoints or not service:
        raise SystemExit('Kubernetes API endpoint discovery failed')
    addresses = [a['ip'] for s in endpoints.get('subsets', []) for a in s.get('addresses', [])]
    addresses += service['spec'].get('clusterIPs', [service['spec']['clusterIP']])
    cidrs = sorted({str(ipaddress.ip_network(ipaddress.ip_address(address))) for address in addresses})
    ports = {p['port'] for s in endpoints.get('subsets', []) for p in s.get('ports', []) if p.get('name') == 'https'}
    if not cidrs or len(ports) != 1:
        raise SystemExit('Expected ready Kubernetes API addresses and one https endpoint port')
    namespaces = [namespace]
    requested = os.environ.get('OPS_READ_NAMESPACES', 'kubeclaw,argocd,kube-system,cilium,tailscale,spire-server,spire-system').split(',')
    for name in requested:
        name = name.strip()
        if not name:
            continue
        if get('namespace', name):
            namespaces.append(name)
    cilium = get('crd', 'ciliumnetworkpolicies.cilium.io') is not None
    return {'rbac': {'namespaces': list(dict.fromkeys(namespaces))},
            'networkPolicy': {'apiServerCIDRs': cidrs, 'apiServerPort': ports.pop(), 'cilium': cilium}}

def setup_secrets():
    if not get('secret', 'codex-ops-bearer', namespace):
        apply_secret('codex-ops-bearer', {'token': secrets.token_urlsafe(48)})
    if os.environ.get('OPS_COPY_PULL_SECRET', '1') == '1' and not get('secret', 'ghcr-secret', namespace):
        source = get('secret', 'ghcr-secret', os.environ.get('OPS_PULL_SECRET_SOURCE_NAMESPACE', 'kubeclaw'))
        if not source:
            raise SystemExit('Missing ghcr-secret. Create it in the Ops namespace or select a valid source namespace.')
        kube(['apply', '-f', '-'], json.dumps({'apiVersion': 'v1', 'kind': 'Secret',
             'metadata': {'name': 'ghcr-secret', 'namespace': namespace}, 'type': source['type'], 'data': source['data']}))
    for variable, name, key in [('OPS_GITHUB_TOKEN_FILE', 'codex-ops-github', 'token'),
                                ('OPS_TAILSCALE_AUTHKEY_FILE', 'codex-ops-tailscale', 'authkey')]:
        if os.environ.get(variable):
            value = Path(os.environ[variable]).read_text().strip()
            if not value:
                raise SystemExit(variable + ' contains an empty credential')
            apply_secret(name, {key: value})
    print('Ops credentials prepared; existing bearer and pull credentials retained')

if __name__ == '__main__':
    if sys.argv[1:] == ['discover']:
        print(json.dumps(discover(), indent=2))
    elif sys.argv[1:] == ['secrets']:
        setup_secrets()
    else:
        raise SystemExit('Usage: bootstrap.py discover|secrets')
