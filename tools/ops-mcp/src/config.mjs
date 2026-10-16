import {loadOpsMcpPolicy} from './policy.mjs';
function allowedNamespaces(value, defaultNamespace, argoNamespace) {
  const namespaces = (value ?? defaultNamespace).split(',');
  const validNamespace = name => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name);
  if (!validNamespace(argoNamespace) || !namespaces.includes(defaultNamespace) || !namespaces.every(validNamespace)) {
    throw new Error('OPS_ALLOWED_NAMESPACES must contain valid, explicit namespaces including OPS_DEFAULT_NAMESPACE');
  }
  return [...new Set(namespaces)];
}

export function loadOpsMcpConfig(environment = process.env) {
  if(Object.hasOwn(environment,'OPS_MCP_POLICY_FILE')){
    for(const key of ['PORT','HOST','OPS_LOCAL_ONLY','OPS_DEFAULT_NAMESPACE','ARGOCD_NAMESPACE','OPS_ALLOWED_NAMESPACES','MCP_ALLOWED_ORIGINS','HUBBLE_BIN','HUBBLE_SERVER'])if(Object.hasOwn(environment,key))throw new Error(`OPS_MCP_POLICY_COMPETING_AUTHOR:${key}`);
    const policy=loadOpsMcpPolicy(environment.OPS_MCP_POLICY_FILE);
    return Object.freeze({...policy.server,namespaces:policy.server.namespaces,allowedOrigins:new Set(policy.server.allowedOrigins),selectedPolicy:policy,kubernetes:policy.kubernetes,hubble:policy.hubble,presentation:policy.presentation,bearer:{file:environment.OPS_MCP_BEARER_TOKEN_FILE,token:environment.OPS_MCP_BEARER_TOKEN}});
  }
  const port = Number(environment.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid Ops MCP listen port');
  const host = environment.HOST ?? '0.0.0.0';
  const localOnly = environment.OPS_LOCAL_ONLY === '1';
  if (localOnly && host !== '127.0.0.1') throw new Error('Local-only MCP requires HOST=127.0.0.1');
  const defaultNamespace = environment.OPS_DEFAULT_NAMESPACE ?? 'kubeclaw';
  const argoNamespace = environment.ARGOCD_NAMESPACE ?? 'argocd';
  return Object.freeze({ port, host, localOnly, defaultNamespace, argoNamespace,
    namespaces: allowedNamespaces(environment.OPS_ALLOWED_NAMESPACES, defaultNamespace, argoNamespace),
    bearer: { file: environment.OPS_MCP_BEARER_TOKEN_FILE, token: environment.OPS_MCP_BEARER_TOKEN },
    allowedOrigins: new Set((environment.MCP_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)),
  });
}
