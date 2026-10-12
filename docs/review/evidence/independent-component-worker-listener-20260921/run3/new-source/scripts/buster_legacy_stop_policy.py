"""Strict inputs for the external Buster legacy maintenance producer."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat


class StopError(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise StopError('BUSTER_LEGACY_STOP_' + reason)


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(value):
    return 'sha256:' + hashlib.sha256(encode(value)).hexdigest()


def strict(value, keys, reason):
    require(isinstance(value, dict) and set(value) == set(keys.split()), reason)


def trusted_path(path, directory=False):
    path = Path(path)
    require(path.is_absolute() and str(path) == os.path.normpath(path), 'PATH_INVALID')
    for part in reversed([path, *path.parents]):
        item = part.lstat()
        require(not stat.S_ISLNK(item.st_mode) and item.st_uid == 0
                and item.st_mode & 0o022 == 0, 'UNTRUSTED_PATH')
    item = path.stat()
    require(stat.S_ISDIR(item.st_mode) if directory else
            stat.S_ISREG(item.st_mode) and item.st_nlink == 1, 'PATH_TYPE_INVALID')
    return path


def read_policy(path):
    trusted_path(path)
    require(Path(path).stat().st_size <= 16384, 'POLICY_TOO_LARGE')
    value = json.loads(Path(path).read_text())
    validate_policy(value)
    return value


def validate_policy(value):
    strict(value, 'schemaVersion namespace deploymentUid pvcUid pvUid nodeUid nodeName volumeRoot '
           'k3sPath k3sDigest k3sVersion runtimeVersion runtimeEndpoint limits', 'POLICY_FIELDS')
    require(value['schemaVersion'] == 'buster-legacy-stop-policy.v1', 'POLICY_VERSION')
    for key in ['namespace', 'nodeName']:
        require(isinstance(value[key], str) and re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,252}', value[key]), 'POLICY_NAME')
    for key in ['deploymentUid', 'pvcUid', 'pvUid', 'nodeUid']:
        require(isinstance(value[key], str) and re.fullmatch(r'[a-zA-Z0-9-]{1,128}', value[key]), 'POLICY_UID')
    require(value['runtimeEndpoint'] == 'unix:///run/k3s/containerd/containerd.sock', 'ENDPOINT_UNSUPPORTED')
    for key in ['volumeRoot', 'k3sPath']:
        require(isinstance(value[key], str) and value[key].startswith('/')
                and os.path.normpath(value[key]) == value[key] and value[key] != '/', 'POLICY_PATH')
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', value['k3sDigest'] or '') is not None, 'CLI_DIGEST')
    for key in ['k3sVersion', 'runtimeVersion']:
        require(isinstance(value[key], str) and 1 <= len(value[key]) <= 256, 'VERSION_REQUIRED')
    strict(value['limits'], 'maximumBytes maximumEntries maximumContainers maximumReceiptBytes maximumTransactionBytes commandSeconds drainSeconds', 'LIMIT_FIELDS')
    ceilings = {'maximumBytes': 2**53-1, 'maximumEntries': 1000000, 'maximumContainers': 64,
                'maximumReceiptBytes': 1048576, 'maximumTransactionBytes': 67108864, 'commandSeconds': 120, 'drainSeconds': 600}
    for name, ceiling in ceilings.items():
        item = value['limits'][name]
        require(type(item) is int and 0 < item <= ceiling, 'LIMIT_INVALID')
    return value
