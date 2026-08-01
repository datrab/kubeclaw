import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
// pipeline/services/orphan-recovery.ts — Buster startup active-session evidence check
// Persisted active-session files are read-only diagnostics. Startup must not
// hydrate local state or kill sessions from file evidence without lifecycle
// read-model authority plus gateway confirmation.

import fs from 'fs';
import { getRepoRoot } from './git-workflows.js';
import { resolveBusterActiveSessionPath } from './pipeline-helpers.js';
import {
  reportBusterRuntimeDiagnostic,
} from './runtime-diagnostics.js';

type OrphanRecoveryOptions = { activeStatePath?: string; cwd?: string };

function inspectPersistedBusterActiveSession(activeStatePath: string) {
  if (selectTruthyValue(() => (!activeStatePath), () => (!fs.existsSync(activeStatePath)))) return { exists: false, ok: true };
  try {
    const data = JSON.parse(fs.readFileSync(activeStatePath, 'utf8'));
    if (!data?.childSessionKey) {
      return { exists: true, ok: false, reason: 'missing_child_session_key', data };
    }
    return { exists: true, ok: true, data };
  } catch (error) {
    return { exists: true, ok: false, reason: 'malformed_active_session_file', error };
  }
}

export async function recoverOrphanedActiveSession(options: OrphanRecoveryOptions = {}) {
  const activeStatePath = activeSessionPathAuthority(options);
  const inspected = inspectPersistedBusterActiveSession(activeStatePath);
  if (!inspected.exists) return { ok: true, found: false, recovered: false, reason: 'no_active_session' };

  const diagnostic = reportBusterRuntimeDiagnostic({
    component: 'buster_recovery',
    surface: 'startup',
    reason: inspected.ok ? 'active_session_file_diagnostic_only' : selectDefinedValue(() => (inspected.reason), () => ('invalid_active_session_file')),
    detail: selectDefinedValue(() => (selectDefinedValue(() => (inspected.error), () => (inspected.data))), () => (`Persisted active-session evidence at ${activeStatePath} is not lifecycle authority`)),
  });

  return {
    ok: true,
    found: inspected.ok,
    invalid: !inspected.ok,
    recovered: false,
    cleaned: false,
    diagnosticOnly: true,
    reason: inspected.ok ? 'active_session_file_diagnostic_only' : inspected.reason,
    activeStatePath,
    diagnostic,
    diagnostics: [diagnostic].filter(Boolean),
    authority: {
      active_session_authority_source: null,
      allow_active_session_file_authority: false,
      allow_evidence_hydration: false,
      fenced: true,
    },
  };
}

function activeSessionPathAuthority(options: OrphanRecoveryOptions): string {
  if (typeof options.activeStatePath === 'string' && options.activeStatePath.trim()) return options.activeStatePath;
  const cwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd : getRepoRoot();
  return resolveBusterActiveSessionPath(cwd);
}
