// Deterministic crash injection for the canonical real E2E harness.
//
// This is inert unless REAL_E2E_ENABLE_CRASH_INJECTION=1 and the generated
// progress.json declares progress.real_e2e.crash_injection.point.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { ensurePipelineRunLogDir } from '../core/paths.ts';
import { getRunId } from '../core/runtime.ts';
import { appendLifecycleEvent } from './status-store.ts';

declare const process: any;
type AnyRecord = Record<string, any>;

export const REAL_E2E_CRASH_EXIT_CODE = 86;

function enabled(): boolean {
  return process?.env?.REAL_E2E_ENABLE_CRASH_INJECTION === '1';
}

function crashConfig(progress: AnyRecord = {}): AnyRecord | null {
  const config = progress?.real_e2e?.crash_injection;
  return config && typeof config === 'object' ? config : null;
}

function safePoint(point: string): string {
  return String(point || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function markerPath(config: AnyRecord, point: string): string {
  const runLogDir = ensurePipelineRunLogDir(config);
  return path.join(runLogDir, 'real-e2e-crash-injection', `${safePoint(point)}.json`);
}

function writeJson(filePath: string, value: AnyRecord): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function appendCrashEvent(config: AnyRecord, point: string, details: AnyRecord): void {
  try {
    appendLifecycleEvent(config, {
      type: 'real_e2e.crash_injected',
      refs: {
        run_id: getRunId(config),
        run_ref: getRunId(config) ? `run:${getRunId(config)}` : null,
        module_id: details.module_id || null,
        gate_id: details.gate_id || null,
      },
      data: {
        point,
        crash_exit_code: REAL_E2E_CRASH_EXIT_CODE,
        scenario: details.scenario || null,
        step_type: details.step_type || null,
        step_id: details.step_id || null,
        attempt: details.attempt ?? null,
        dispatch_id: details.dispatch_id || null,
      },
    });
  } catch (_error) {
    // The marker is the durable E2E crash contract. Lifecycle append is extra
    // evidence and must not prevent the deterministic crash.
  }
}

export function maybeCrashForRealE2E(config: AnyRecord = {}, progress: AnyRecord = {}, point: string, details: AnyRecord = {}): void {
  if (!enabled()) return;
  const requested = crashConfig(progress);
  if (!requested || safePoint(requested.point) !== safePoint(point)) return;

  const marker = markerPath(config, point);
  if (fs.existsSync(marker)) return;

  const payload = {
    schema_version: 'real_e2e_crash_injection.v1',
    artifact_type: 'real_e2e_crash_injection',
    point: safePoint(point),
    requested_point: requested.point,
    run_id: getRunId(config),
    project: config?.project || null,
    scenario: progress?.real_e2e?.scenario_id || null,
    crashed_at: new Date().toISOString(),
    exit_code: REAL_E2E_CRASH_EXIT_CODE,
    details,
  };
  writeJson(marker, payload);
  appendCrashEvent(config, safePoint(point), {
    ...details,
    scenario: payload.scenario,
  });
  process.stderr.write(`${JSON.stringify({
    ok: false,
    phase: 'real-e2e-crash-injection',
    point: payload.point,
    run_id: payload.run_id,
    marker,
    exit_code: REAL_E2E_CRASH_EXIT_CODE,
  })}\n`);
  process.exit(REAL_E2E_CRASH_EXIT_CODE);
}

