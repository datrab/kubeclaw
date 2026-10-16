"""Read the shared selected owner once, before supervising any process."""
import json
import math
from pathlib import Path
from types import MappingProxyType

def load_supervisor_policy(file):
    value = json.loads(Path(file).read_text())
    if not isinstance(value, dict) or value.get('schemaVersion') != 'ops-mcp-policy.v1' or set(value) != {'schemaVersion','server','kubernetes','hubble','presentation','supervisor'}:
        raise ValueError('OPS_SUPERVISOR_POLICY_INVALID')
    port = value.get('server', {}).get('port')
    if isinstance(port, bool) or not isinstance(port,int) or not 1 <= port <= 65535:
        raise ValueError('OPS_SUPERVISOR_PORT_INVALID')
    policy = value.get('supervisor')
    fields = {'controlTerminationTimeoutSeconds', 'controlSocketProbeTimeoutSeconds', 'loginStatusTimeoutSeconds', 'controlStartupTimeoutSeconds', 'controlHealthPollSeconds', 'controlStartupPollSeconds', 'restartWaitSeconds', 'loginRetryWaitSeconds'}
    if not isinstance(policy,dict) or set(policy) != fields:
        raise ValueError('OPS_SUPERVISOR_POLICY_FIELDS_INVALID')
    if any(isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v) or not 0 < v <= 2147483647 for v in policy.values()):
        raise ValueError('OPS_SUPERVISOR_POLICY_LIMIT_INVALID')
    return f'http://127.0.0.1:{port}/mcp', MappingProxyType(policy)
