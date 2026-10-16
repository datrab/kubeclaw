"""Original selected deployment policy, captured before discovery or credentials."""
import json
from pathlib import Path
import re
from types import MappingProxyType

def load_deployment_policy(file):
    canonical=Path(file).resolve(strict=True)
    p=json.loads(canonical.read_text())
    keys={'schemaVersion','namespace','release','valuesFile','kubectlRequestTimeoutSeconds','readNamespaces','copyPullSecret','pullSecretSourceNamespace','bearerTokenEntropyBytes','helmHistoryMax'}
    name=lambda v:isinstance(v,str) and re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',v) is not None
    integer=lambda v,a,b:type(v) is int and a<=v<=b
    if not isinstance(p,dict) or set(p)!=keys or p['schemaVersion']!='ops-deployment-policy.v1' or not all(name(p[k]) for k in ['namespace','release','pullSecretSourceNamespace']) or type(p['copyPullSecret']) is not bool or not isinstance(p['readNamespaces'],list) or not all(name(v) for v in p['readNamespaces']) or len(set(p['readNamespaces']))!=len(p['readNamespaces']) or not integer(p['kubectlRequestTimeoutSeconds'],1,2147483647) or not integer(p['helmHistoryMax'],1,2147483647) or not integer(p['bearerTokenEntropyBytes'],32,384) or (p['valuesFile'] is not None and (not isinstance(p['valuesFile'],str) or not p['valuesFile'] or any(v in p['valuesFile'] for v in ['\x00','\r','\n']))):
        raise ValueError('OPS_DEPLOYMENT_POLICY_INVALID')
    p['readNamespaces']=tuple(p['readNamespaces'])
    if p['valuesFile'] is not None:p['valuesFile']=str((canonical.parent/p['valuesFile']).resolve())
    return MappingProxyType(p)
