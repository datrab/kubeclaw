import fs from 'fs';
import path from 'path';
import { discoverLatestRun } from '../run-discovery.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export function addDiagnostic(diagnostics: any, entry: any = {}) {
  if (!Array.isArray(diagnostics)) return;
  diagnostics.push({
    ts: new Date().toISOString(),
    ...entry,
  });
}

export function readJsonRecord(filePath: any, diagnostics: any = null, { optional = true }: any = {}) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch (error: any) {
      const diag = {
        source: 'json',
        status: 'malformed',
        path: filePath,
        optional,
        reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
      };
      addDiagnostic(diagnostics, diag);
      return { ok: false, data: null, diagnostic: diag };
    }
  } catch (error: any) {
    const missing = error?.code === 'ENOENT';
    const diag = {
      source: 'json',
      status: missing ? 'missing' : 'unavailable',
      path: filePath,
      optional,
      reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
    };
    addDiagnostic(diagnostics, diag);
    return { ok: false, data: null, diagnostic: diag };
  }
}

export function readJsonData(filePath: any, diagnostics: any = null, opts: any = {}) {
  return readJsonRecord(filePath, diagnostics, opts).data;
}

export function extToLang(ext: any) {
  const m: Record<string, string> = {
    '.py':'Python','.pyi':'Python','.ts':'TypeScript','.tsx':'TypeScript',
    '.js':'JavaScript','.jsx':'JavaScript','.cjs':'JavaScript','.mjs':'JavaScript',
    '.html':'HTML','.htm':'HTML','.css':'CSS','.scss':'CSS','.less':'CSS',
    '.json':'JSON','.md':'Markdown','.yaml':'YAML','.yml':'YAML',
    '.sql':'SQL','.sh':'Shell','.bash':'Shell','.dockerfile':'Docker',
  };
  return selectDefinedValue(() => (m[ext]), () => ('Other'));
}

export function discoverLatestLifecycleReadModels(swarmRoot: any, readJsonData: any, diagnostics: any = null) {
  const pipelineLogRoot = path.join(swarmRoot, 'logs', 'pipeline');
  const latest = discoverLatestRun(pipelineLogRoot);
  if (!latest) return { data: null, path: null, source: 'absent' };
  const readModelsPath = path.join(pipelineLogRoot, 'runs', latest.run_id, 'lifecycle', 'read-models.json');
  const data = readJsonData(readModelsPath, diagnostics);
  if (data && typeof data === 'object') return { data, path: readModelsPath, source: 'run_catalog' };
  return { data: null, path: null, source: 'absent' };
}
