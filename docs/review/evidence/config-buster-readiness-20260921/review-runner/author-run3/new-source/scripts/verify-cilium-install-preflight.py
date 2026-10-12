#!/usr/bin/env python3
"""Fail closed on incomplete node/CRI observations before initial Cilium install."""
import json
import subprocess


def read(*command):
    return json.loads(subprocess.check_output(command, text=True))


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify():
    nodes = read('kubectl', 'get', 'nodes', '-o', 'json')
    require(isinstance(nodes, dict) and isinstance(nodes.get('items'), list),
            'Node observation must contain an items array')
    items = nodes['items']
    require(len(items) == 1 and isinstance(items[0], dict)
            and isinstance(items[0].get('spec'), dict)
            and items[0]['spec'].get('unschedulable') is True,
            'Initial cutover requires exactly one explicitly cordoned node')
    pods = read('k3s', 'crictl', 'pods', '-o', 'json')
    require(isinstance(pods, dict) and isinstance(pods.get('items'), list),
            'CRI observation must contain an items array')
    seen = set()
    for pod in pods['items']:
        require(isinstance(pod, dict), 'Invalid CRI sandbox observation')
        identity = pod.get('id')
        require(isinstance(identity, str) and bool(identity.strip()) and identity not in seen,
                'CRI sandbox must have a nonempty unique ID')
        seen.add(identity)
        state = pod.get('state')
        require(state in ('SANDBOX_READY', 'SANDBOX_NOTREADY'),
                'Unknown CRI sandbox state: ' + identity)
        if state == 'SANDBOX_NOTREADY':
            continue
        info = read('k3s', 'crictl', 'inspectp', identity)
        require(isinstance(info, dict) and isinstance(info.get('status'), dict),
                'Missing CRI sandbox status: ' + identity)
        status = info['status']
        require(status.get('id') == identity and status.get('state') == 'SANDBOX_READY',
                'Inconsistent CRI sandbox inspection: ' + identity)
        linux = status.get('linux')
        namespaces = linux.get('namespaces') if isinstance(linux, dict) else None
        options = namespaces.get('options') if isinstance(namespaces, dict) else None
        mode = options.get('network') if isinstance(options, dict) else None
        require(mode == 'NODE' or (type(mode) is int and mode == 2),
                'Old or unknown non-host sandbox still ready: ' + identity)


if __name__ == '__main__':
    verify()
