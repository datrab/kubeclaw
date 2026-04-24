import fs from 'fs';

function hasRefPart(value) {
  return value !== undefined && value !== null && value !== '';
}

export function buildStageRefs(entries = {}) {
  const refs = {};
  for (const [key, spec] of Object.entries(entries || {})) {
    if (!spec) continue;
    if (typeof spec === 'string') {
      refs[key] = spec;
      continue;
    }

    const prefix = spec?.prefix;
    const parts = Array.isArray(spec?.parts) ? spec.parts : [];
    if (!prefix || parts.some((part) => !hasRefPart(part))) continue;
    refs[key] = `${prefix}:${parts.map((part) => String(part)).join(':')}`;
  }
  return refs;
}

export function buildStagePluginInvocation(stageId, fields = {}) {
  return {
    stageId,
    ...(fields || {}),
  };
}

export function collectExistingArtifactRefs(candidates = [], existsFn = fs.existsSync) {
  const refs = [];
  for (const artifact of candidates || []) {
    if (!artifact?.path || !existsFn(artifact.path)) continue;
    refs.push(artifact);
  }
  return refs;
}
