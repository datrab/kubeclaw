// pipeline/services/orphan-recovery.ts — Buster startup active-session evidence check
// Persisted active-session files are read-only diagnostics. Startup must not
// hydrate local state or kill sessions from file evidence without lifecycle
// read-model authority plus gateway confirmation.

import fs from 'fs';
import { getRepoRoot } from './git-workflows.ts';
import { resolveBusterActiveSessionPath } from './pipeline-helpers.ts';
import {
  reportBusterRuntimeDiagnostic,
} from './runtime-diagnostics.ts';

function inspectPersistedBusterActiveSession(activeStatePath) {
  if (!activeStatePath || !fs.existsSync(activeStatePath)) return { exists: false, ok: true };
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

export async function recoverOrphanedActiveSession(options = {}) {
  const activeStatePath = options.activeStatePath || resolveBusterActiveSessionPath(options.cwd || getRepoRoot());
  const inspected = inspectPersistedBusterActiveSession(activeStatePath);
  if (!inspected.exists) return { ok: true, found: false, recovered: false, reason: 'no_active_session' };

  const diagnostic = reportBusterRuntimeDiagnostic({
    component: 'buster_recovery',
    surface: 'startup',
    reason: inspected.ok ? 'active_session_file_diagnostic_only' : inspected.reason || 'invalid_active_session_file',
    detail: inspected.error || inspected.data || `Persisted active-session evidence at ${activeStatePath} is not lifecycle authority`,
  });

  return {
    ok: false,
    found: inspected.ok,
    invalid: !inspected.ok,
    recovered: false,
    cleaned: false,
    reason: inspected.ok ? 'lifecycle_authority_absent' : inspected.reason,
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
