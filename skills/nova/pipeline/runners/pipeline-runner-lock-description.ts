type AnyRecord = Record<string, any>;

function optionalDetail(label: string, value: any): string | null {
  return value ? `${label} ${value}` : null;
}

export function describePipelineRunLock(existing: AnyRecord | null, requested: AnyRecord, validLease: boolean): string {
  if (existing?.malformed) {
    return `Pipeline runtime lock is malformed and cannot be safely reclaimed (${existing.error || 'invalid JSON'}). Manual cleanup required: verify no pipeline run is active for this swarm_dir, then remove active-run.lock.json and retry.`;
  }
  if (!validLease) {
    return 'Pipeline runtime lock does not match the required leased-lock contract. Manual cleanup required: verify no pipeline run is active for this swarm_dir, then remove active-run.lock.json and retry.';
  }
  const details = [
    existing?.project ? `project ${existing.project}` : `requested project ${requested.project || 'missing_project'}`,
    optionalDetail('run', existing?.run_id), optionalDetail('module', existing?.module),
    optionalDetail('pid', existing?.pid), optionalDetail('host', existing?.hostname),
    optionalDetail('lease_expires_at', existing?.lease_expires_at),
  ].filter(Boolean).join(', ');
  return `Another pipeline run is already active for this shared runtime/swarm (${details}). Concurrent pipeline runs are intentionally serialized per swarm_dir.`;
}
