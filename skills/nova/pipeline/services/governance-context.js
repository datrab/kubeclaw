// services/governance-context.js — Cross-module governance signal storage
//
// Stores governance signals from modules 07-10 in a shared, ephemeral context
// on config._governanceCtx so they can be surfaced in run summaries, approval
// embeds, and audit artifacts without tight coupling between modules.
//
// Written by:
//   pipeline-runner.js        — arch validator outcome (module 08)
//   approval-gate-runner.js   — approval gate outcomes (module 10)
//
// Read by:
//   summary.js                — governance section of summary.json
//   approval-gate-runner.js   — approval embed enrichment
//
// This module is purely in-memory during a run. Authoritative artifacts
// are written by the individual governance modules under .swarm/logs/.

import { log } from '../core/logger.js';
import { getRunStats } from '../core/runtime.js';

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Ensure config._governanceCtx exists and return it.
 * Safe to call multiple times — idempotent.
 */
export function initGovernanceCtx(config) {
  if (!config._governanceCtx) {
    config._governanceCtx = {
      arch_validator: null,
      approval_gates: [],
    };
  }
  return config._governanceCtx;
}

/**
 * Return the current governance context, or null if not initialized.
 */
export function getGovernanceCtx(config) {
  return config._governanceCtx || null;
}

// ── Architecture validator outcome ────────────────────────────────────────────

/**
 * Record the outcome of the pre-pipeline architecture validator run.
 * Called by pipeline-runner.js after runArchValidator() returns.
 *
 * @param {object} config
 * @param {object} result  — { blocked, findings, timestamp, project }
 */
export function recordArchValidatorResult(config, result) {
  const ctx = initGovernanceCtx(config);
  const findings = result.findings || [];
  const blockingCount = findings.filter(f => f.severity === 'blocking').length;
  const errorCount    = findings.filter(f => f.severity === 'error').length;
  const warnCount     = findings.filter(f => f.severity === 'warn').length;
  const infoCount     = findings.filter(f => f.severity === 'info').length;

  let outcome;
  if (result.blocked) {
    outcome = 'BLOCKED';
  } else if (findings.length > 0) {
    outcome = 'PASSED_WITH_FINDINGS';
  } else {
    outcome = 'PASSED';
  }

  ctx.arch_validator = {
    ran:             true,
    blocked:         result.blocked,
    timestamp:       result.timestamp || new Date().toISOString(),
    findings_total:  findings.length,
    blocking_count:  blockingCount,
    error_count:     errorCount,
    warn_count:      warnCount,
    info_count:      infoCount,
    outcome,
    artifact_path:   '.swarm/logs/architecture-validator/results.json',
    summary_path:    '.swarm/logs/architecture-validator/summary.md',
  };

  log('DEBUG', `[governance] Arch validator recorded: outcome=${outcome} findings=${findings.length}`);
}

// ── Approval gate outcomes ─────────────────────────────────────────────────────

/**
 * Record the outcome of one approval gate.
 * Called by approval-gate-runner.js when a gate resolves.
 *
 * @param {object} config
 * @param {string} gateId
 * @param {string} gateTitle
 * @param {string} status       — APPROVED | REJECTED | TIMED_OUT | CANCELLED
 * @param {string|null} decisionBy
 * @param {string|null} reason
 */
export function recordApprovalGateOutcome(config, gateId, gateTitle, status, decisionBy, reason) {
  const ctx = initGovernanceCtx(config);
  ctx.approval_gates.push({
    gate_id:     gateId,
    gate_title:  gateTitle || gateId,
    status,
    decision_by: decisionBy || null,
    reason:      reason || null,
    recorded_at: new Date().toISOString(),
    artifact_path: `.swarm/logs/gates/${gateId}/approval-decision.json`,
  });
  log('DEBUG', `[governance] Approval gate recorded: ${gateId} → ${status}`);
}

// ── Governance summary builder ────────────────────────────────────────────────

/**
 * Build a governance summary object for embedding in summary.json.
 *
 * Includes:
 *   - arch_validator outcome (from module 08)
 *   - approval_gates list with each gate's final status (from module 10)
 *   - override_policy_log path (from module 09 logEffectivePolicy output)
 *   - artifact references for operator navigation
 *
 * @param {object} config
 * @returns {object} governance summary
 */
export function buildGovernanceSummary(config) {
  const ctx = config._governanceCtx || null;
  const stats = getRunStats(config);

  // Determine overall governance outcome for the run
  let overall = 'unknown';
  if (ctx) {
    const archBlocked = ctx.arch_validator?.blocked === true;
    const anyRejected = ctx.approval_gates.some(g => g.status === 'REJECTED');
    const anyTimeout  = ctx.approval_gates.some(g => g.status === 'TIMED_OUT');
    const allApproved = ctx.approval_gates.length === 0 ||
      ctx.approval_gates.every(g => g.status === 'APPROVED');

    if (archBlocked) {
      overall = 'BLOCKED_BY_ARCH_VALIDATOR';
    } else if (anyRejected) {
      overall = 'REJECTED_BY_OPERATOR';
    } else if (anyTimeout) {
      overall = 'HALTED_ON_APPROVAL_TIMEOUT';
    } else if (allApproved) {
      overall = ctx.arch_validator
        ? (ctx.arch_validator.outcome === 'PASSED' ? 'CLEAN' : 'PASSED_WITH_FINDINGS')
        : 'unknown';
    }
  }

  return {
    overall_outcome: overall,
    arch_validator:  ctx?.arch_validator  || { ran: false },
    approval_gates:  ctx?.approval_gates  || [],
    artifacts: {
      architecture_validator: '.swarm/logs/architecture-validator/results.json',
      override_policy_log:    '.swarm/logs/pipeline/model-policy.jsonl',
      cost_report:            '.swarm/logs/cost/run-usage.json',
      pipeline_events:        '.swarm/logs/pipeline/pipeline.jsonl',
      approval_gate_logs:     '.swarm/logs/gates/',
    },
  };
}

/**
 * Build a concise governance context block for inclusion in approval embeds.
 * Returns an array of Discord embed fields.
 *
 * @param {object} config
 * @returns {Array<{name: string, value: string, inline: boolean}>}
 */
export function buildGovernanceEmbedFields(config) {
  const ctx = config._governanceCtx;
  const fields = [];

  // Arch validator outcome
  if (ctx?.arch_validator) {
    const av = ctx.arch_validator;
    let avValue = av.outcome;
    if (av.findings_total > 0) {
      const parts = [];
      if (av.blocking_count > 0) parts.push(`${av.blocking_count} blocking`);
      if (av.error_count    > 0) parts.push(`${av.error_count} error`);
      if (av.warn_count     > 0) parts.push(`${av.warn_count} warn`);
      if (parts.length > 0) avValue += ` (${parts.join(', ')})`;
    }
    fields.push({ name: 'Architecture Validator', value: avValue, inline: true });
  }

  // Token usage snapshot
  try {
    const stats = getRunStats(config);
    if (stats) {
      const input  = stats.inputTokens  ?? null;
      const output = stats.outputTokens ?? null;
      if (input != null || output != null) {
        const total = (input ?? 0) + (output ?? 0);
        fields.push({ name: 'Tokens So Far', value: total.toLocaleString(), inline: true });
      }
    }
  } catch { /* non-critical */ }

  return fields;
}
