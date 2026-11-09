type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('KUBERNETES_FIXTURE_NETWORK_POLICY_INVALID');
  return value as ObjectValue;
}
function keys(value: ObjectValue, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('KUBERNETES_FIXTURE_NETWORK_ENVELOPE_DENIED');
}
function selector(value: unknown, nonempty = false): void {
  const item = object(value); keys(item, ['matchLabels']);
  const labels = object(item.matchLabels ?? {});
  if ((nonempty && Object.keys(labels).length === 0) || Object.keys(labels).length > 32 || Object.entries(labels).some(([key, value]) =>
    !key || typeof value !== 'string' || value.length > 63)) throw new Error('KUBERNETES_FIXTURE_NETWORK_SELECTOR_INVALID');
}
/** Product rules may select local pods, or exactly cluster DNS on port 53. */
export function validateFixtureNetworkPolicy(value: unknown): void {
  const spec = object(value); keys(spec, ['podSelector', 'policyTypes', 'ingress', 'egress']); selector(spec.podSelector);
  if (!Array.isArray(spec.policyTypes) || spec.policyTypes.length < 1 || spec.policyTypes.length > 2
    || spec.policyTypes.some(type => !['Ingress', 'Egress'].includes(String(type)))) throw new Error('KUBERNETES_FIXTURE_NETWORK_POLICY_INVALID');
  for (const direction of ['ingress', 'egress']) {
    if (spec[direction] === undefined) continue;
    if (!spec.policyTypes.includes(direction === 'ingress' ? 'Ingress' : 'Egress')) throw new Error('KUBERNETES_FIXTURE_NETWORK_POLICY_INVALID');
    const rules = spec[direction];
    if (!Array.isArray(rules) || rules.length > 64) throw new Error('KUBERNETES_FIXTURE_NETWORK_POLICY_INVALID');
    for (const raw of rules) {
      const rule = object(raw); const peerField = direction === 'ingress' ? 'from' : 'to'; keys(rule, [peerField, 'ports']);
      const peers = rule[peerField];
      if (!Array.isArray(peers) || !peers.length || peers.length > 32) throw new Error('KUBERNETES_FIXTURE_NETWORK_ENVELOPE_DENIED');
      let dns = false;
      for (const rawPeer of peers) {
        const peer = object(rawPeer); keys(peer, ['podSelector', 'namespaceSelector']); selector(peer.podSelector, true);
        if (peer.namespaceSelector !== undefined) {
          const namespace = object(peer.namespaceSelector); keys(namespace, ['matchLabels']);
          const labels = object(namespace.matchLabels); const pod = object(peer.podSelector); const podLabels = object(pod.matchLabels);
          if (direction !== 'egress' || Object.keys(labels).length !== 1 || labels['kubernetes.io/metadata.name'] !== 'kube-system'
            || Object.keys(podLabels).length !== 1 || podLabels['k8s-app'] !== 'kube-dns') throw new Error('KUBERNETES_FIXTURE_NETWORK_ENVELOPE_DENIED');
          dns = true;
        }
      }
      if (!Array.isArray(rule.ports) || !rule.ports.length || rule.ports.length > 32) throw new Error('KUBERNETES_FIXTURE_NETWORK_PORT_REQUIRED');
      for (const rawPort of rule.ports) {
        const port = object(rawPort); keys(port, ['port', 'protocol']);
        if (!Number.isSafeInteger(port.port) || Number(port.port) < 1 || Number(port.port) > 65535
          || !['TCP', 'UDP'].includes(String(port.protocol ?? 'TCP')) || (dns && port.port !== 53)) throw new Error('KUBERNETES_FIXTURE_NETWORK_PORT_DENIED');
      }
    }
  }
}
