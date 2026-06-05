// runners/module-runner/preflight.ts — Forge preflight validation flow

import { log } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import { resolveStatusGatewayLabel } from '../../services/correlation.ts';
import {
  currentAttemptNumber,
} from '../module-runner-shared.ts';
import { buildRetryResult } from './terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../services/discord-fields.ts';

export async function runModulePreflight({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  maxFails,
  deps,
  recalledMemoryIds = [],
} = {}) {
  const preflightResult = deps.runPreflightValidation(mod, dir, config);
  if (preflightResult.passed) return { status, terminal: null };

  const reason = deps.formatValidationFailures(preflightResult.failures);
  log('WARN', `Module ${moduleId} preflight contract validation failed — aborting Forge spawn`);
  await deps.discord(config, 'WARN', `Module ${moduleId} PREFLIGHT FAIL`,
    `Contract mismatch detected before Forge spawn. Fix FORGE.md and retry.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
        run_id: getRunId(config),
        module_id: moduleId,
        attempt: currentAttemptNumber(status),
        gateway_label: resolveStatusGatewayLabel(status),
      }),
      { name: 'Stage', value: 'preflight_contract' },
      { name: 'Issues', value: String(preflightResult.failures.length) },
      { name: 'Codes', value: preflightResult.failures.map(f => f.code).join(', ') },
    ]);

  const failResult = await deps.handleFail(config, status, dir, moduleId, maxFails, 'preflight_contract', reason, {
    progress,
    recalledMemoryIds,
  });
  return failResult._retry
    ? { status, terminal: buildRetryResult(failResult, status) }
    : { status, terminal: { retry: false, result: failResult } };
}

export default runModulePreflight;
