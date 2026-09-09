// Offline generator consumers select an explicit non-secret operator contract.
// No credential values or runtime registry service are supplied by this fixture.
export const registryTestContract = JSON.stringify({ schemaVersion: 'registry-clients.v1', registry: {
  endpoint: 'https://registry.example.test:5443', transport: 'https',
  auth: { usernameEnvironmentVariable: 'REGISTRY_TEST_USER', passwordEnvironmentVariable: 'REGISTRY_TEST_PASSWORD' },
} });
