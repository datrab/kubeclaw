import fs from 'fs';
import path from 'path';

export function addDiagnostic(diagnostics, entry = {}) {
  if (!Array.isArray(diagnostics)) return;
  diagnostics.push({
    ts: new Date().toISOString(),
    ...entry,
  });
}

export function readJsonRecord(filePath, diagnostics = null, { optional = true } = {}) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch (error) {
      const diag = {
        source: 'json',
        status: 'malformed',
        path: filePath,
        optional,
        reason: error?.message || 'unknown',
      };
      addDiagnostic(diagnostics, diag);
      return { ok: false, data: null, diagnostic: diag };
    }
  } catch (error) {
    const missing = error?.code === 'ENOENT';
    const diag = {
      source: 'json',
      status: missing ? 'missing' : 'unavailable',
      path: filePath,
      optional,
      reason: error?.message || 'unknown',
    };
    addDiagnostic(diagnostics, diag);
    return { ok: false, data: null, diagnostic: diag };
  }
}

export function readJsonData(filePath, diagnostics = null, opts = {}) {
  return readJsonRecord(filePath, diagnostics, opts).data;
}

export function extToLang(ext) {
  const m = {
    '.py':'Python','.pyi':'Python','.ts':'TypeScript','.tsx':'TypeScript',
    '.js':'JavaScript','.jsx':'JavaScript','.cjs':'JavaScript','.mjs':'JavaScript',
    '.html':'HTML','.htm':'HTML','.css':'CSS','.scss':'CSS','.less':'CSS',
    '.json':'JSON','.md':'Markdown','.yaml':'YAML','.yml':'YAML',
    '.sql':'SQL','.sh':'Shell','.bash':'Shell','.dockerfile':'Docker',
  };
  return m[ext] || 'Other';
}

export function discoverLatestLifecycleReadModels(swarmRoot, readJsonData, diagnostics = null) {
  const pipelineLogRoot = path.join(swarmRoot, 'logs', 'pipeline');
  const latestPointerPath = path.join(pipelineLogRoot, 'latest.json');
  const latest = readJsonData(latestPointerPath, diagnostics);
  const candidatePaths = [];

  const runDir = typeof latest?.run_dir === 'string' && latest.run_dir.trim()
    ? path.join(pipelineLogRoot, latest.run_dir, 'lifecycle', 'read-models.json')
    : null;
  const runIdPath = typeof latest?.run_id === 'string' && latest.run_id.trim()
    ? path.join(pipelineLogRoot, 'runs', latest.run_id, 'lifecycle', 'read-models.json')
    : null;
  if (runDir) candidatePaths.push(runDir);
  if (runIdPath && runIdPath !== runDir) candidatePaths.push(runIdPath);

  for (const candidatePath of candidatePaths) {
    const data = readJsonData(candidatePath, diagnostics);
    if (data && typeof data === 'object') {
      return { data, path: candidatePath, source: 'latest_pointer' };
    }
  }

  const runsRoot = path.join(pipelineLogRoot, 'runs');
  if (!fs.existsSync(runsRoot)) return { data: null, path: null, source: 'absent' };

  const fallbackCandidates = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const readModelsPath = path.join(runsRoot, entry.name, 'lifecycle', 'read-models.json');
      if (!fs.existsSync(readModelsPath)) return null;
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(readModelsPath).mtimeMs;
      } catch (_error) {
        mtimeMs = 0;
      }
      return { readModelsPath, mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of fallbackCandidates) {
    const data = readJsonData(candidate.readModelsPath, diagnostics);
    if (data && typeof data === 'object') {
      return { data, path: candidate.readModelsPath, source: 'latest_run_fallback' };
    }
  }

  return { data: null, path: null, source: 'absent' };
}
