import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { getRunId } from '../../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../../../services/correlation.ts';
import {
  transitionModuleStatus,
  markModuleBlocked,
} from '../../../lifecycle-state.ts';
import {
  buildTerminalBusterCrashFailEvent,
  currentAttemptNumber,
  emitTerminalBusterCrashTelemetry,
  emitTerminalModuleFailTelemetry,
} from '../../module-runner-shared.ts';
import {
  resolveCompletionDispatchId,
  resolveCompletionGatewayLabel,
} from './identity.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleNeedsNovaTerminalResult,
} from '../terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

export async function handleBusterFailOrBlockedStatus({
  config,
  moduleId,
  mod,
  dir,
  status,
  deps,
  redisEntry,
  failureClass: explicitFailureClass,
  busterModel,
  completionIdentity,
  completionSessionKey,
  busterAttempt,
  maxBusterCrashRetries,
  isLastBusterAttempt,
  handleModuleFail,
  buildRetryResult,
  recalledMemoryIds,
}: AnyRecord = {}) {
  // Classify from explicit worker failure_class only. Verdict/source presence is evidence,
  // but no longer authorizes Buster failure routing.
  const source = redisEntry?.source || 'unknown';
  const resultRedisEntry = redisEntry || null;
  const failureClass = String(explicitFailureClass || '').trim().toLowerCase();
  if (!failureClass) {
    const reason = 'Buster terminal failure lacks explicit typed failure_class';
    log('ERROR', `Module ${moduleId}: ${reason}`);
    const blockedTransition = markModuleBlocked(
      status,
      'buster',
      reason,
      { reason: 'buster_failure_class_missing' },
    );
    deps.saveStatus(config, dir, status, blockedTransition);
    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason,
      runId: resultRedisEntry?.run_id ?? completionIdentity.runId ?? getRunId(config),
      moduleDir: dir,
      attempt: resultRedisEntry?.attempt ?? completionIdentity.attempt ?? currentAttemptNumber(status),
      phase: 'buster',
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: resolveCompletionGatewayLabel(status, completionIdentity),
      sessionKey: completionSessionKey,
      diagnostics: {
        metadata: { code: 'buster_failure_class_missing', redis_source: source },
      },
    }) };
  }
  const isCrash = failureClass === 'infra_crash';
  const isPreTest = failureClass === 'pretest_infra' || failureClass === 'pretest_config' || failureClass === 'pretest_code';

  // ── Category 1: Infrastructure crash ──
  if (isCrash && !isLastBusterAttempt) {
    log('WARN', `Buster subagent crashed (source: ${source}, attempt ${busterAttempt}/${maxBusterCrashRetries + 1}) — retrying Buster`);
    const retryDiscordCorrelation = {
      run_id: completionIdentity.runId ?? completionIdentity.run_id ?? getRunId(config),
      module_id: moduleId,
      attempt: currentAttemptNumber(status),
      dispatch_id: resolveCompletionDispatchId(status, completionIdentity),
      gateway_label: resolveCompletionGatewayLabel(status, completionIdentity),
      session_key: completionSessionKey,
    };
    await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
      `Subagent crashed (source: ${source}). Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: completionSessionKey }),
      { correlation: retryDiscordCorrelation },
    );

    // Reset to READY_FOR_TESTING — don't count as fail_count (that's for Forge retries)
    const retryTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: `Buster subagent crashed (source: ${source}) — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
    });
    deps.saveStatus(config, dir, status, retryTransition);
    return { retry: true, status };
  }

  if (isCrash) {
    // Crash retries exhausted → BLOCKED (infrastructure issue)
    log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

    const crashAttemptBudget = maxBusterCrashRetries + 1;
    const crashAttemptSuffix = crashAttemptBudget === 1 ? '' : 's';
    const crashFailReason = `Buster subagent crashed (${source})`;
    const blockedTelemetryReason = `Buster crash retries exhausted after ${crashAttemptBudget} attempt${crashAttemptSuffix} (${source})`;
    const crashDispatchId = resolveCompletionDispatchId(status, completionIdentity);
    const crashGatewayLabel = resolveCompletionGatewayLabel(status, completionIdentity);
    const failEvent = buildTerminalBusterCrashFailEvent(
      status,
      mod,
      busterModel,
      'TESTING',
      crashFailReason,
      {
        sessionKey: completionSessionKey,
        dispatchId: crashDispatchId,
        gatewayLabel: crashGatewayLabel,
      },
    );

    const blockedTransition = markModuleBlocked(
      status,
      'buster',
      `Buster subagent crashed ${maxBusterCrashRetries + 1} times (source: ${source}). Infrastructure issue — Forge cannot fix this.`,
      { reason: 'buster_infra_crash_retries_exhausted' },
    );
    deps.saveStatus(config, dir, status, blockedTransition);

    await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
      `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: completionSessionKey }),
        { name: 'Source', value: source },
        { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
      ], {
        correlation: {
          run_id: completionIdentity.runId ?? completionIdentity.run_id ?? getRunId(config),
          module_id: moduleId,
          attempt: currentAttemptNumber(status),
          dispatch_id: crashDispatchId,
          gateway_label: crashGatewayLabel,
          session_key: completionSessionKey,
        },
      });
    await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedTelemetryReason, crashAttemptBudget);

    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
      runId: completionIdentity.runId ?? getRunId(config),
      moduleDir: dir,
      attempt: failEvent.attempt,
      phase: 'buster',
      dispatchId: failEvent.dispatch_id,
      gatewayLabel: failEvent.gateway_label,
      sessionKey: (resolveStatusSessionKey(status) ?? completionSessionKey),
    }) };
  }

  // ── Category 2: Explicit typed pre-test failure ──
  if (isPreTest) {
    const failedSuiteNames = deps.getFailedSuiteNames(redisEntry);
    const passedSuiteNames = deps.getPassedSuiteNames(redisEntry);
    const preTestReason = deps.extractPreTestFailReason(redisEntry);
    const preTestClass = deps.classifyPreTestFailure(redisEntry);
    const preTestFields = deps.buildPreTestDiscordFields(redisEntry);

    log('WARN', `Pre-test failure [${preTestClass.kind}/${preTestClass.code}]: ${preTestReason} (suites: ${failedSuiteNames.join(',') || 'unknown'})`);

    if (preTestClass.kind === 'infra' || preTestClass.kind === 'config') {
      const preTestRetryTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
        note: `Buster pre-test ${preTestClass.kind} issue: ${preTestClass.summary}`,
      });
      deps.saveStatus(config, dir, status, preTestRetryTransition);

      const preTestDispatchId = (resolveResultDispatchId(resultRedisEntry) ?? resolveCompletionDispatchId(status, completionIdentity));
      const preTestGatewayLabel = (resolveResultGatewayLabel(resultRedisEntry) ?? resolveCompletionGatewayLabel(status, completionIdentity));
      const preTestSessionKey = (resolveResultSessionKey(resultRedisEntry) ?? resolveStatusSessionKey(status) ?? completionSessionKey);

      await deps.discord(
        config,
        preTestClass.kind === 'infra' ? 'CRITICAL' : 'WARN',
        `Module ${moduleId} — ${preTestClass.kind === 'infra' ? 'Buster Infra Issue' : 'Buster Config Issue'}`,
        `${preTestClass.summary}. Forge output preserved; fix the ${preTestClass.kind === 'infra' ? 'test environment' : 'test config'} and resume Buster.`,
        [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), dispatch_id: preTestDispatchId, gateway_label: preTestGatewayLabel, session_key: preTestSessionKey }),
          { name: 'Classification', value: preTestClass.summary, inline: false },
          ...preTestFields,
          { name: 'Action', value: preTestClass.kind === 'infra' ? 'Fix Buster / registry / sandbox infra, then --resume' : 'Fix progress.json test_config / test_suites / serve, then --resume', inline: false },
          { name: 'Reason', value: preTestReason.slice(0, 1024), inline: false },
        ],
        {
          correlation: {
            run_id: getRunId(config),
            module_id: moduleId,
            attempt: currentAttemptNumber(status),
            dispatch_id: preTestDispatchId,
            gateway_label: preTestGatewayLabel,
            session_key: preTestSessionKey,
          },
        },
      );

      emitTerminalModuleFailTelemetry(
        config,
        moduleId,
        status,
        mod,
        'buster',
        busterModel,
        status?.status ?? STATUS.TESTING,
        `Buster ${preTestClass.kind} issue (${preTestClass.code}) — Forge output preserved: ${preTestClass.detail}`,
        {
          dispatchId: preTestDispatchId,
          gatewayLabel: preTestGatewayLabel,
          sessionKey: preTestSessionKey,
        },
      );

      return { terminal: buildModuleNeedsNovaTerminalResult(config, moduleId, {
        reason: `Buster ${preTestClass.kind} issue (${preTestClass.code}) — Forge output preserved: ${preTestClass.detail}`,
        runId: resultRedisEntry?.run_id ?? completionIdentity.runId ?? getRunId(config),
        moduleDir: dir,
        attempt: resultRedisEntry?.attempt ?? completionIdentity.attempt ?? currentAttemptNumber(status),
        phase: 'buster',
        dispatchId: preTestDispatchId,
        gatewayLabel: preTestGatewayLabel,
        sessionKey: preTestSessionKey,
        metadata: {
          failed_suites: failedSuiteNames,
          passed_suites: passedSuiteNames,
          forge_preserved: true,
          pretest_classification: preTestClass,
        },
      }) };
    }

    // Check if same suite(s) already failed as pre-test in a previous attempt.
    const previousPreTestFails = (status.fail_summaries || [])
      .filter((s: AnyRecord) => typeof s === 'object' && typeof s.summary === 'string'
                && s.summary.startsWith('[buster/pre-test]'));

    const isRepeatedPreTestFail = failedSuiteNames.length > 0
      && previousPreTestFails.some((prev: AnyRecord) =>
        failedSuiteNames.some((suite: string) => prev.summary.includes(suite))
      );

    if (isRepeatedPreTestFail) {
      log('ERROR', `Module ${moduleId}: repeated pre-test failure in ${failedSuiteNames.join(',')} — escalating without another Forge cycle`);

      const repeatedPreTestDispatchId = (resolveResultDispatchId(resultRedisEntry) ?? resolveCompletionDispatchId(status, completionIdentity));
      const repeatedPreTestGatewayLabel = (resolveResultGatewayLabel(resultRedisEntry) ?? resolveCompletionGatewayLabel(status, completionIdentity));
      const repeatedPreTestSessionKey = (resolveResultSessionKey(resultRedisEntry) ?? resolveStatusSessionKey(status) ?? completionSessionKey);

      await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Repeated Pre-Test Failure`,
        `The same pre-test suite(s) failed again after a Forge retry. Stopping before another code cycle.`, [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), dispatch_id: repeatedPreTestDispatchId, gateway_label: repeatedPreTestGatewayLabel, session_key: repeatedPreTestSessionKey }),
          ...preTestFields,
          { name: 'Reason', value: preTestReason.slice(0, 1024), inline: false },
          { name: 'Action', value: 'Investigate deterministic test failure before resuming Forge', inline: false },
        ], {
          correlation: {
            run_id: getRunId(config),
            module_id: moduleId,
            attempt: currentAttemptNumber(status),
            dispatch_id: repeatedPreTestDispatchId,
            gateway_label: repeatedPreTestGatewayLabel,
            session_key: repeatedPreTestSessionKey,
          },
        });

      emitTerminalModuleFailTelemetry(
        config,
        moduleId,
        status,
        mod,
        'buster',
        busterModel,
        status?.status ?? STATUS.TESTING,
        `Repeated pre-test failure (${failedSuiteNames.join(',')}) — needs Nova review before another Forge cycle`,
        {
          dispatchId: repeatedPreTestDispatchId,
          gatewayLabel: repeatedPreTestGatewayLabel,
          sessionKey: repeatedPreTestSessionKey,
        },
      );

      return { terminal: buildModuleNeedsNovaTerminalResult(config, moduleId, {
        reason: `Repeated pre-test failure (${failedSuiteNames.join(',')}) — needs Nova review before another Forge cycle`,
        runId: resultRedisEntry?.run_id ?? completionIdentity.runId ?? getRunId(config),
        moduleDir: dir,
        attempt: resultRedisEntry?.attempt ?? completionIdentity.attempt ?? currentAttemptNumber(status),
        phase: 'buster',
        dispatchId: repeatedPreTestDispatchId,
        gatewayLabel: repeatedPreTestGatewayLabel,
        sessionKey: repeatedPreTestSessionKey,
        metadata: {
          failed_suites: failedSuiteNames,
          passed_suites: passedSuiteNames,
          pretest_classification: preTestClass,
        },
      }) };
    }

    // Code-side pre-test failure → give Forge a chance.
    log('INFO', `Code-side pre-test failure — routing to Forge via handleFail`);
    const failResult = await handleModuleFail(status, 'buster',
      preTestReason, {
        recalledMemoryIds,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: resolveCompletionGatewayLabel(status, completionIdentity),
        session_key: (resolveStatusSessionKey(status) ?? completionSessionKey),
        discordFields: [
          ...preTestFields,
          { name: 'Stage', value: 'Pre-test suites', inline: true },
          { name: 'Subagent Spawned?', value: 'No', inline: true },
        ],
      });
    if (failResult._retry) return { terminal: buildRetryResult(failResult, status) };
    return { terminal: { retry: false, result: failResult } };
  }

  // ── Category 3: Agent test failure (normal) ──
  const failResult = await handleModuleFail(status, 'buster',
    deps.extractAgentFailReason(status, 'buster'), { recalledMemoryIds, dispatch_id: completionIdentity.dispatchId, gateway_label: resolveCompletionGatewayLabel(status, completionIdentity), session_key: completionSessionKey });
  if (failResult._retry) return { terminal: buildRetryResult(failResult, status) };
  return { terminal: { retry: false, result: failResult } };
}
