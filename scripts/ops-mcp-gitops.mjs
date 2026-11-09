// Exact fields owned by the in-cluster credential provisioner. Never suppress
// diffs for arbitrary Secrets or workloads in the infrastructure Application.
export function opsMcpCredentialDiffs(namespace, defaults, overrides = {}) {
  const mcp = { ...defaults, ...overrides, provision: { ...defaults.provision, ...overrides.provision } };
  if (!mcp.provision.enabled) return [];
  const objects = new Map();
  const add = (kind, ns, name) => objects.set(`${kind}/${ns}/${name}`, { group: '', kind, namespace: ns, name, jsonPointers: ['/data'] });
  add('Secret', namespace, mcp.provision.caSecret);
  add('Secret', namespace, mcp.tlsSecret);
  add('ConfigMap', namespace, mcp.caConfigMap);
  for (const client of mcp.clients) {
    add('Secret', namespace, client.tokenSecret);
    add('Secret', client.namespace, client.tokenSecret);
    add('ConfigMap', client.namespace, mcp.caConfigMap);
  }
  return [...objects.values()];
}
