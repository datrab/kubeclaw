import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import {
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../../../services/correlation.ts';
import {
  transitionModuleStatus,
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
import { applyModuleRunnerCompletion } from '../completions.ts';
import {
  buildModuleErrorTerminalResult,
  buildModuleBlockedTerminalResult,
  buildModuleNeedsNovaTerminalResult,
} from '../terminal-results.ts';
import { emitPipelineCheckpoint } from '../../../services/pipeline-checkpoint.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

import { selectDefinedValue, selectTruthyValue } from '../../../optional-absence.ts';
type AnyRecord = Record<string, any>;

function requireNonEmptyString(value: unknown, field: string): string {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`Buster terminal failure requires ${field}`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requirePositiveAttempt(value: unknown, field: string): number {
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) {
    throw new Error(`Buster terminal failure requires ${field}`);
  }
  return attempt;
}

export async function handleBusterFailOrBlockedStatus({
  config,
  progress,
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
  const source = selectDefinedValue(() => (redisEntry?.source), () => ('missing_source'));
  const resultRedisEntry = selectDefinedValue(() => (redisEntry), () => (null));
  const failureClass = String(selectDefinedValue(() => (explicitFailureClass), () => (''))).trim().toLowerCase();
  const runId = requireNonEmptyString(completionIdentity?.runId, 'completionIdentity.runId');
  const attempt = requirePositiveAttempt(currentAttemptNumber(status), 'current status attempt');
  const statusName = requireNonEmptyString(status?.status, 'status.status');
  const completionDispatchId = resolveCompletionDispatchId(status, completionIdentity);
  const completionGatewayLabel = resolveCompletionGatewayLabel(status, completionIdentity);
  const terminalSessionKey = optionalNonEmptyString(completionSessionKey);
  if (!failureClass) {
    const reason = 'Buster terminal failure lacks explicit typed failure_class';
    log('ERROR', `Module ${moduleId}: ${reason}`);
    applyModuleRunnerCompletion({
      deps,
      config,
      dir,
      status,
      moduleId,
      phase: 'buster',
      attempt,
      completionStatus: 'BLOCKED',
      authority: { kind: 'worker' },
      reasonCode: 'buster_failure_class_missing',
      summary: reason,
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: completionGatewayLabel,
      sessionKey: terminalSessionKey,
      metadata: { fail_count: status.fail_count },
    });
    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason,
      runId,
      moduleDir: dir,
      attempt,
      phase: 'buster',
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: completionGatewayLabel,
      sessionKey: terminalSessionKey,
      diagnostics: {
        metadata: { code: 'buster_failure_class_missing', redis_source: source },
      },
    }) };
  }
  const isCrash = failureClass === 'infra_crash';
  const isBusterInfraError = failureClass === 'infra_error';
  const isPreTest = selectTruthyValue(() => (selectTruthyValue(() => (failureClass === 'pretest_infra'), () => (failureClass === 'pretest_config'))), () => (failureClass === 'pretest_code'));
  const isOutputArtifactFailure = selectTruthyValue(() => (failureClass === 'output_file_identity_mismatch'), () => (failureClass === 'output_file_missing'));

  if (isOutputArtifactFailure) {
    const mismatchDispatchId = requireNonEmptyString(resolveResultDispatchId(resultRedisEntry), 'result dispatch id');
    const mismatchGatewayLabel = requireNonEmptyString(resolveResultGatewayLabel(resultRedisEntry), 'result gateway label');
    const mismatchSessionKey = optionalNonEmptyString(resolveResultSessionKey(resultRedisEntry));
    const outputFailureLabel = failureClass === 'output_file_missing'
      ? 'Buster output_file missing'
      : 'Buster output_file identity mismatch';
    const outputFailureAction = failureClass === 'output_file_missing'
      ? 'Inspect why Buster did not write buster-output.json, then resume Buster.'
      : 'Inspect Buster output_file identity/correlation state, then resume Buster.';
    const outputFailureDescription = failureClass === 'output_file_missing'
      ? 'This is a Buster/runtime output artifact failure, not an app-code verdict. Forge output preserved.'
      : 'This is an infrastructure/correlation failure, not an app-code verdict. Forge output preserved.';
    const outputFailureBlockedReason = failureClass;
    const reason = resultRedisEntry?.summary
      ? resultRedisEntry.summary
      : status?.completion_summary
        ? status.completion_summary
        : outputFailureLabel;
    log('ERROR', `Module ${moduleId}: ${reason} — completion contract failure, not routing to Forge`);

    applyModuleRunnerCompletion({
      deps,
      config,
      dir,
      status,
      moduleId,
      phase: 'buster',
      attempt,
      completionStatus: 'ERROR',
      authority: { kind: 'redis', dispatch_id: mismatchDispatchId },
      reasonCode: failureClass,
      summary: `${reason}. Completion contract failure — Forge cannot fix Buster output artifact failures.`,
      dispatchId: mismatchDispatchId,
      gatewayLabel: mismatchGatewayLabel,
      sessionKey: mismatchSessionKey,
      metadata: { failure_class: failureClass, redis_source: source },
    });

    await deps.discord(config, 'CRITICAL', `Module ${moduleId} FAILED — ${outputFailureLabel}`,
      `${reason}. ${outputFailureDescription}`, [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
          run_id: runId,
          module_id: moduleId,
          attempt,
          dispatch_id: mismatchDispatchId,
          gateway_label: mismatchGatewayLabel,
          session_key: mismatchSessionKey,
          model: selectDefinedValue(() => (completionIdentity.model), () => (null)),
          model_source: selectDefinedValue(() => (completionIdentity.model_source), () => (null)),
          reasoning_level: selectDefinedValue(() => (completionIdentity.reasoning_level), () => (null)),
          thinking_source: selectDefinedValue(() => (completionIdentity.thinking_source), () => (null)),
          runtime: selectDefinedValue(() => (completionIdentity.runtime), () => (null)),
        }),
        { name: 'Action', value: outputFailureAction, inline: false },
      ], {
        correlation: {
          run_id: runId,
          module_id: moduleId,
          attempt,
          dispatch_id: mismatchDispatchId,
          gateway_label: mismatchGatewayLabel,
          session_key: mismatchSessionKey,
        },
      });

    emitTerminalModuleFailTelemetry(
      config,
      moduleId,
      status,
      mod,
      'buster',
      busterModel,
      statusName,
      `${outputFailureLabel} — Forge output preserved: ${reason}`,
      {
        dispatchId: mismatchDispatchId,
        gatewayLabel: mismatchGatewayLabel,
        sessionKey: mismatchSessionKey,
      },
    );

    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason: `${outputFailureLabel} — completion contract failure (not sent to Forge)`,
      issueType: 'environment',
      runId,
      moduleDir: dir,
      attempt,
      phase: 'buster',
      dispatchId: mismatchDispatchId,
      gatewayLabel: mismatchGatewayLabel,
      sessionKey: mismatchSessionKey,
      metadata: {
        failure_class: failureClass,
        redis_source: source,
        forge_preserved: true,
        output_file_reason: selectDefinedValue(() => (selectDefinedValue(() => (resultRedisEntry?.reason), () => (status?.reason))), () => (null)),
      },
    }) };
  }

  if (isBusterInfraError) {
    const infraDispatchId = requireNonEmptyString(resolveResultDispatchId(resultRedisEntry), 'Buster infra result dispatch id');
    const infraGatewayLabel = selectDefinedValue(
      () => (optionalNonEmptyString(resolveResultGatewayLabel(resultRedisEntry))),
      () => (completionGatewayLabel),
    );
    const infraSessionKey = selectDefinedValue(
      () => (optionalNonEmptyString(resolveResultSessionKey(resultRedisEntry))),
      () => (terminalSessionKey),
    );
    const reason = selectDefinedValue(
      () => (selectDefinedValue(() => (resultRedisEntry?.summary), () => (status?.completion_summary))),
      () => ('Buster infrastructure failure'),
    );
    log('ERROR', `Module ${moduleId}: ${reason} — Buster infrastructure issue, not routing to Forge`);

    applyModuleRunnerCompletion({
      deps,
      config,
      dir,
      status,
      moduleId,
      phase: 'buster',
      attempt,
      completionStatus: 'BLOCKED',
      authority: { kind: 'redis', dispatch_id: infraDispatchId },
      reasonCode: 'infra_error',
      summary: `${reason}. Infrastructure issue — Forge cannot fix this.`,
      dispatchId: infraDispatchId,
      gatewayLabel: infraGatewayLabel,
      sessionKey: infraSessionKey,
      metadata: {
        failure_class: 'infra_error',
        redis_source: source,
        forge_preserved: true,
      },
    });

    await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster infrastructure`,
      `${reason}. This is a Buster infrastructure issue, not an app-code problem. Manual intervention required.`, [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
          run_id: runId,
          module_id: moduleId,
          attempt,
          dispatch_id: infraDispatchId,
          gateway_label: infraGatewayLabel,
          session_key: infraSessionKey,
          model: selectDefinedValue(() => (completionIdentity.model), () => (null)),
          model_source: selectDefinedValue(() => (completionIdentity.model_source), () => (null)),
          reasoning_level: selectDefinedValue(() => (completionIdentity.reasoning_level), () => (null)),
          thinking_source: selectDefinedValue(() => (completionIdentity.thinking_source), () => (null)),
          runtime: selectDefinedValue(() => (completionIdentity.runtime), () => (null)),
        }),
        { name: 'Action', value: 'Fix Buster worker / queue / sandbox infrastructure, then resume Buster.', inline: false },
      ], {
        correlation: {
          run_id: runId,
          module_id: moduleId,
          attempt,
          dispatch_id: infraDispatchId,
          gateway_label: infraGatewayLabel,
          session_key: infraSessionKey,
        },
      });

    emitTerminalModuleFailTelemetry(
      config,
      moduleId,
      status,
      mod,
      'buster',
      busterModel,
      statusName,
      `Buster infrastructure issue — Forge output preserved: ${reason}`,
      {
        dispatchId: infraDispatchId,
        gatewayLabel: infraGatewayLabel,
        sessionKey: infraSessionKey,
      },
    );

    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason: `Buster infrastructure issue — Forge output preserved: ${reason}`,
      issueType: 'environment',
      runId,
      moduleDir: dir,
      attempt,
      phase: 'buster',
      dispatchId: infraDispatchId,
      gatewayLabel: infraGatewayLabel,
      sessionKey: infraSessionKey,
      metadata: {
        failure_class: 'infra_error',
        redis_source: source,
        forge_preserved: true,
      },
    }) };
  }

  // ── Category 1: Infrastructure crash ──
  if (isCrash && !isLastBusterAttempt) {
    log('WARN', `Buster subagent crashed (source: ${source}, attempt ${busterAttempt}/${maxBusterCrashRetries + 1}) — retrying Buster`);
    const retryDiscordCorrelation = {
      run_id: runId,
      module_id: moduleId,
      attempt,
      dispatch_id: completionDispatchId,
      gateway_label: completionGatewayLabel,
      session_key: terminalSessionKey,
    };
    await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
      `Subagent crashed (source: ${source}). Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: terminalSessionKey }),
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
    const crashDispatchId = completionDispatchId;
    const crashGatewayLabel = completionGatewayLabel;
    const failEvent = buildTerminalBusterCrashFailEvent(
      status,
      mod,
      busterModel,
      'TESTING',
      crashFailReason,
      {
        sessionKey: terminalSessionKey,
        dispatchId: crashDispatchId,
        gatewayLabel: crashGatewayLabel,
      },
    );

    applyModuleRunnerCompletion({
      deps,
      config,
      dir,
      status,
      moduleId,
      phase: 'buster',
      attempt,
      completionStatus: 'BLOCKED',
      authority: { kind: 'redis', dispatch_id: crashDispatchId },
      reasonCode: 'buster_infra_crash_retries_exhausted',
      summary: `Buster subagent crashed ${maxBusterCrashRetries + 1} times (source: ${source}). Infrastructure issue — Forge cannot fix this.`,
      dispatchId: crashDispatchId,
      gatewayLabel: crashGatewayLabel,
      sessionKey: terminalSessionKey,
      metadata: { fail_count: status.fail_count },
    });

    await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
      `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: terminalSessionKey }),
        { name: 'Source', value: source },
        { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
      ], {
        correlation: {
          run_id: runId,
          module_id: moduleId,
          attempt,
          dispatch_id: crashDispatchId,
          gateway_label: crashGatewayLabel,
          session_key: terminalSessionKey,
        },
      });
    await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedTelemetryReason, crashAttemptBudget);

    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
      runId,
      moduleDir: dir,
      attempt: failEvent.attempt,
      phase: 'buster',
      dispatchId: failEvent.dispatch_id,
      gatewayLabel: failEvent.gateway_label,
      sessionKey: terminalSessionKey,
    }) };
  }

  // ── Category 2: Explicit typed pre-test failure ──
  if (isPreTest) {
    const failedSuiteNames = deps.getFailedSuiteNames(redisEntry);
    const passedSuiteNames = deps.getPassedSuiteNames(redisEntry);
    const preTestReason = deps.extractPreTestFailReason(redisEntry);
    const preTestClass = deps.classifyPreTestFailure(redisEntry);
    const preTestFields = deps.buildPreTestDiscordFields(redisEntry);
    const failedSuitesDisplay = failedSuiteNames.length > 0 ? failedSuiteNames.join(',') : 'missing_suite_names';

    log('WARN', `Pre-test failure [${preTestClass.kind}/${preTestClass.code}]: ${preTestReason} (suites: ${failedSuitesDisplay})`);

    if (selectTruthyValue(() => (preTestClass.kind === 'infra'), () => (preTestClass.kind === 'config'))) {
      const preTestRetryTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
        note: `Buster pre-test ${preTestClass.kind} issue: ${preTestClass.summary}`,
      });
      deps.saveStatus(config, dir, status, preTestRetryTransition);

      const preTestDispatchId = requireNonEmptyString(resolveResultDispatchId(resultRedisEntry), 'pre-test result dispatch id');
      const preTestGatewayLabel = requireNonEmptyString(resolveResultGatewayLabel(resultRedisEntry), 'pre-test result gateway label');
      const preTestSessionKey = optionalNonEmptyString(resolveResultSessionKey(resultRedisEntry));

      await deps.discord(
        config,
        preTestClass.kind === 'infra' ? 'CRITICAL' : 'WARN',
        `Module ${moduleId} — ${preTestClass.kind === 'infra' ? 'Buster Infra Issue' : 'Buster Config Issue'}`,
        `${preTestClass.summary}. Forge output preserved; fix the ${preTestClass.kind === 'infra' ? 'test environment' : 'test config'} and resume Buster.`,
        [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: runId, module_id: moduleId, attempt, dispatch_id: preTestDispatchId, gateway_label: preTestGatewayLabel, session_key: preTestSessionKey }),
          { name: 'Classification', value: preTestClass.summary, inline: false },
          ...preTestFields,
          { name: 'Action', value: preTestClass.kind === 'infra' ? 'Fix Buster / registry / sandbox infra, then --resume' : 'Fix progress.json test_config / test_suites / serve, then --resume', inline: false },
          { name: 'Reason', value: preTestReason.slice(0, 1024), inline: false },
        ],
        {
          correlation: {
            run_id: runId,
            module_id: moduleId,
            attempt,
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
        statusName,
        `Buster ${preTestClass.kind} issue (${preTestClass.code}) — Forge output preserved: ${preTestClass.detail}`,
        {
          dispatchId: preTestDispatchId,
          gatewayLabel: preTestGatewayLabel,
          sessionKey: preTestSessionKey,
        },
      );

      return { terminal: buildModuleNeedsNovaTerminalResult(config, moduleId, {
        reason: `Buster ${preTestClass.kind} issue (${preTestClass.code}) — Forge output preserved: ${preTestClass.detail}`,
        runId,
        moduleDir: dir,
        attempt,
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
    const previousPreTestFails = (selectDefinedValue(() => (status.fail_summaries), () => ([])))
      .filter((s: AnyRecord) => typeof s === 'object' && typeof s.summary === 'string'
                && s.summary.startsWith('[buster/pre-test]'));

    const isRepeatedPreTestFail = failedSuiteNames.length > 0
      && previousPreTestFails.some((prev: AnyRecord) =>
        failedSuiteNames.some((suite: string) => prev.summary.includes(suite))
      );

    if (isRepeatedPreTestFail) {
      log('ERROR', `Module ${moduleId}: repeated pre-test failure in ${failedSuiteNames.join(',')} — escalating without another Forge cycle`);

      const repeatedPreTestDispatchId = requireNonEmptyString(resolveResultDispatchId(resultRedisEntry), 'repeated pre-test result dispatch id');
      const repeatedPreTestGatewayLabel = selectDefinedValue(
        () => (optionalNonEmptyString(resolveResultGatewayLabel(resultRedisEntry))),
        () => (completionGatewayLabel),
      );
      const repeatedPreTestSessionKey = selectDefinedValue(
        () => (optionalNonEmptyString(resolveResultSessionKey(resultRedisEntry))),
        () => (terminalSessionKey),
      );

      await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Repeated Pre-Test Failure`,
        `The same pre-test suite(s) failed again after a Forge retry. Stopping before another code cycle.`, [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: runId, module_id: moduleId, attempt, dispatch_id: repeatedPreTestDispatchId, gateway_label: repeatedPreTestGatewayLabel, session_key: repeatedPreTestSessionKey }),
          ...preTestFields,
          { name: 'Reason', value: preTestReason.slice(0, 1024), inline: false },
          { name: 'Action', value: 'Investigate deterministic test failure before resuming Forge', inline: false },
        ], {
          correlation: {
            run_id: runId,
            module_id: moduleId,
            attempt,
            dispatch_id: repeatedPreTestDispatchId,
            gateway_label: repeatedPreTestGatewayLabel,
            session_key: repeatedPreTestSessionKey,
          },
        });

      if (repeatedPreTestGatewayLabel && repeatedPreTestSessionKey) {
        emitTerminalModuleFailTelemetry(
          config,
          moduleId,
          status,
          mod,
          'buster',
          busterModel,
          statusName,
          `Repeated pre-test failure (${failedSuiteNames.join(',')}) — needs operator review before another Forge cycle`,
          {
            dispatchId: repeatedPreTestDispatchId,
            gatewayLabel: repeatedPreTestGatewayLabel,
            sessionKey: repeatedPreTestSessionKey,
          },
        );
      }

      applyModuleRunnerCompletion({
        deps,
        config,
        dir,
        status,
        moduleId,
        phase: 'buster',
        attempt,
        completionStatus: 'FAIL',
        authority: { kind: 'redis', dispatch_id: repeatedPreTestDispatchId },
        reasonCode: 'test_failure',
        summary: preTestReason,
        dispatchId: repeatedPreTestDispatchId,
        gatewayLabel: repeatedPreTestGatewayLabel,
        sessionKey: repeatedPreTestSessionKey,
        metadata: {
          failed_suites: failedSuiteNames,
          passed_suites: passedSuiteNames,
          failure_class: 'test_failure',
          pretest_classification: preTestClass,
        },
      });

      applyModuleRunnerCompletion({
        deps,
        config,
        dir,
        status,
        moduleId,
        phase: 'buster',
        attempt,
        completionStatus: 'BLOCKED',
        authority: { kind: 'redis', dispatch_id: repeatedPreTestDispatchId },
        reasonCode: 'test_failure',
        summary: `Repeated pre-test failure (${failedSuiteNames.join(',')}) — stopping before another Forge cycle`,
        dispatchId: repeatedPreTestDispatchId,
        gatewayLabel: repeatedPreTestGatewayLabel,
        sessionKey: repeatedPreTestSessionKey,
        metadata: {
          failed_suites: failedSuiteNames,
          passed_suites: passedSuiteNames,
          failure_class: 'test_failure',
          pretest_classification: preTestClass,
        },
      });

      return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
        reason: `Repeated pre-test failure (${failedSuiteNames.join(',')}) — stopping before another Forge cycle`,
        runId,
        moduleDir: dir,
        attempt,
        phase: 'buster',
        dispatchId: repeatedPreTestDispatchId,
        gatewayLabel: repeatedPreTestGatewayLabel,
        sessionKey: repeatedPreTestSessionKey,
        metadata: {
          failed_suites: failedSuiteNames,
          passed_suites: passedSuiteNames,
          failure_class: 'test_failure',
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
        gateway_label: completionGatewayLabel,
        session_key: terminalSessionKey,
        discordFields: [
          ...preTestFields,
          { name: 'Stage', value: 'Pre-test suites', inline: true },
          { name: 'Subagent Spawned?', value: 'No', inline: true },
        ],
      });
    if (failResult._retry) {
      emitPipelineCheckpoint(config, 'after_failed_gate_before_retry', {
        step_type: 'module',
        step_id: moduleId,
        module_id: moduleId,
        attempt,
        dispatch_id: completionIdentity.dispatchId,
      });
      return { terminal: buildRetryResult(failResult, status) };
    }
    return { terminal: { retry: false, result: failResult } };
  }

  // ── Category 3: Agent test failure (normal) ──
  const failResult = await handleModuleFail(status, 'buster',
    deps.extractAgentFailReason(status, 'buster'), { recalledMemoryIds, dispatch_id: completionIdentity.dispatchId, gateway_label: completionGatewayLabel, session_key: terminalSessionKey });
  if (failResult._retry) {
    emitPipelineCheckpoint(config, 'after_failed_gate_before_retry', {
      step_type: 'module',
      step_id: moduleId,
      module_id: moduleId,
      attempt,
      dispatch_id: completionIdentity.dispatchId,
    });
    return { terminal: buildRetryResult(failResult, status) };
  }
  return { terminal: { retry: false, result: failResult } };
}
