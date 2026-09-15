#!/usr/bin/env python3
"""Compare source policy specs with live specs; fail on drift (including extra keys).
Run with trusted platform credentials. Dry-run admission does not persist resources.
"""
import json
import subprocess
import sys
import yaml


def run(*args):
    return subprocess.check_output(args, text=True)


def documents(text):
    decoder = json.JSONDecoder()
    while text.strip():
        value, end = decoder.raw_decode(text.lstrip())
        text = text.lstrip()[end:]
        yield from value['items'] if value.get('kind') == 'List' else [value]


def verify(namespace, paths):
    for path in paths:
        scope = [] if path.endswith(('cilium-cluster-policies.yaml', 'spire-network-policies.yaml')) else ['-n', namespace]
        desired = run('kubectl', 'apply', '--dry-run=server', *scope, '-f', path, '-o', 'json')
        # Do not treat the merged dry-run response as desired: it can retain
        # live fields absent from Git and hide drift. Compare against source.
        for obj in yaml.safe_load_all(open(path, encoding='utf-8')):
            if obj is None:
                continue
            if obj['kind'] not in ('NetworkPolicy', 'CiliumNetworkPolicy', 'CiliumClusterwideNetworkPolicy'):
                raise RuntimeError('Only policy resources are accepted')
            meta = obj['metadata']
            args = ['kubectl', 'get', obj['kind'], meta['name'], '-o', 'json']
            if obj['kind'] != 'CiliumClusterwideNetworkPolicy':
                args += ['-n', meta.get('namespace', namespace)]
            live = json.loads(run(*args))
            for field in ('spec', 'specs'):
                if live.get(field) != obj.get(field):
                    raise RuntimeError(f"Policy drift: {obj['kind']}/{meta['name']} {field}")
    agents = json.loads(run('kubectl', '-n', 'cilium', 'get', 'pods', '-l', 'k8s-app=cilium', '-o', 'json'))['items']
    if not agents:
        raise RuntimeError('No Cilium agents found')
    for agent in agents:
        endpoints = json.loads(run('kubectl', '-n', 'cilium', 'exec', agent['metadata']['name'], '-c', 'cilium-agent', '--', 'cilium-dbg', 'endpoint', 'list', '-o', 'json'))
        for ep in endpoints:
            status = ep.get('status', {})
            policy = status.get('policy', {})
            desired = policy['spec'].get('policy-revision', 0) if 'spec' in policy else None
            realized = policy['realized'].get('policy-revision', 0) if 'realized' in policy else None
            if status.get('state') != 'ready' or desired is None or realized != desired:
                raise RuntimeError(f"Endpoint not ready/realized on {agent['metadata']['name']}: {ep.get('id')}")
    print('Desired policy specs match and current agent endpoints are ready at their desired revisions.')
    print('This does not replace unmanaged-pod checks, negative probes or the pipeline test.')


if __name__ == '__main__':
    verify(sys.argv[1], sys.argv[2:])
