export function ensureRuntimeConfiguration(client, apiEndpoint) {
  const source = client.get('ConfigMap', 'familyclaw-configuration');
  if (source?.metadata?.labels?.['app.kubernetes.io/managed-by'] !== 'familyclaw-initializer') {
    throw new Error('Household configuration ownership mismatch');
  }
  const core = JSON.parse(source.data['core.json']);
  core.paperless.endpoint = apiEndpoint(core.paperless.endpoint);
  const data = {...source.data, 'core.json': JSON.stringify(core)};
  const name = 'familyclaw-configuration-api';
  const managedBy = 'familyclaw-api-configuration';
  const desired = {apiVersion: 'v1', kind: 'ConfigMap',
    metadata: {name, labels: {'app.kubernetes.io/managed-by': managedBy}}, data};
  let existing = client.get('ConfigMap', name);
  if (!existing && client.create(desired, true, true)) return {runtimeConfigurationCreated: true, name};
  existing ??= client.get('ConfigMap', name);
  if (existing?.metadata?.labels?.['app.kubernetes.io/managed-by'] !== managedBy
    || Object.keys(existing.data ?? {}).length !== Object.keys(data).length
    || Object.entries(data).some(([key, value]) => existing.data[key] !== value)) {
    throw new Error('Existing runtime configuration differs; refusing overwrite');
  }
  return {runtimeConfigurationPreserved: true, name};
}
