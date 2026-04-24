export function buildGeneratorArtifactRef(type, artifactPath, extras = {}) {
  if (!artifactPath) return null;
  return {
    type,
    path: artifactPath,
    ...extras,
  };
}

export function buildGeneratorResult(producerType, { artifacts = [], outputs = {}, diagnostics = {} } = {}) {
  const result = {
    schemaVersion: 'v1',
    producerKind: 'generator',
    producerType,
    outputs,
  };
  const filteredArtifacts = artifacts.filter(Boolean);
  if (filteredArtifacts.length) result.artifacts = filteredArtifacts;
  if (diagnostics && Object.keys(diagnostics).length) result.diagnostics = diagnostics;
  return result;
}
