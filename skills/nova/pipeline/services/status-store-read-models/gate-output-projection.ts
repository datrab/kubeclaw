import fs from "fs";
import { gateOutputPath } from "../../core/paths.ts";
import {
  cloneSerializable,
  getLifecycleGateState,
  loadLifecycleReadModels,
} from "../status-store-lifecycle.ts";
import {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from "./common.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  GATE_OUTPUT_FAIL_STATUS,
  GATE_OUTPUT_FAIL_STATUSES,
  GATE_OUTPUT_PASS_STATUSES,
  approvalGateType,
  buildGateStatusAuthorityPolicy,
  buildInvalidGateOutput,
  existingGateReadModel,
  gateOutputStatus,
  normalizeGateOutputStatus,
  normalizedUpperText,
  selectPresentValue,
} from "./gate-evidence-projection.ts";
import { projectApprovalGateReadModel } from "./gate-approval-projection.ts";
export function buildGateSchedulerDrift({
  output = null,
  completion = null,
}: any = {}) {
  void completion;
  const drift: any[] = [];
  if (output?.invalid_contract) {
    drift.push({
      code: "gate_output_invalid_contract",
      output_path: selectDefinedValue(
        () => output.path,
        () => null,
      ),
      reason: selectDefinedValue(
        () => output.invalid_reason,
        () => null,
      ),
      parse_error: output.parse_error === true,
    });
  }
  return drift;
}

function absentOutput(path: string | null = null): any {
  return {
    exists: false,
    data: null,
    isPass: false,
    isFail: false,
    parse_error: false,
    invalid_contract: false,
    path,
    status: null,
  };
}

function parseOutputFile(outPath: string): any {
  let content: string;
  try {
    content = fs.readFileSync(outPath, "utf8");
  } catch (error: any) {
    return buildInvalidGateOutput(outPath, "read_failed", {
      error: error.message,
    });
  }
  try {
    return JSON.parse(content);
  } catch (error: any) {
    return buildInvalidGateOutput(outPath, "invalid_json", {
      parse_error: true,
      error: error.message,
    });
  }
}

function validOutput(
  path: string,
  data: any,
  status: string,
  isPass: boolean,
): any {
  return {
    exists: true,
    data,
    isPass,
    isFail: !isPass,
    status,
    parse_error: false,
    invalid_contract: false,
    path,
  };
}

export function readGateOutput(config: any, gate: any) {
  if (!gate?.output_file) return absentOutput();
  const outPath = gateOutputPath(config, gate);
  if (!outPath || !fs.existsSync(outPath)) return absentOutput(outPath);
  const data: any = parseOutputFile(outPath);
  if (data?.invalid_contract) return data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    return buildInvalidGateOutput(outPath, "not_object", { data });

  const status = normalizeGateOutputStatus(data.status);
  if (!status) {
    return buildInvalidGateOutput(outPath, "missing_gate_output_status", {
      data,
    });
  }

  if (GATE_OUTPUT_PASS_STATUSES.has(status))
    return validOutput(outPath, data, status, true);
  if (GATE_OUTPUT_FAIL_STATUSES.has(status))
    return validOutput(outPath, data, status, false);

  return buildInvalidGateOutput(outPath, "unsupported_gate_output_status", {
    data,
  });
}

function invalidCompletion(gateId: any, output: any, authority: any): any {
  const outcome = output.parse_error ? "parse_error" : "invalid_contract";
  return {
    done: true,
    ok: false,
    outcome,
    source: GATE_OUTPUT_EVIDENCE_SOURCE,
    status: "INVALID_OUTPUT",
    data: {
      gate: gateId,
      status: "INVALID_OUTPUT",
      reason: `Gate output contract invalid: ${output.invalid_reason ?? "missing_invalid_reason"}`,
      invalid_reason: output.invalid_reason ?? null,
      error: output.error ?? null,
    },
    output,
    gateStatusAuthority: authority,
  };
}

function verdictCompletion(output: any, authority: any): any {
  const data = output.data ?? {};
  const status = gateOutputStatus(output);
  if (GATE_OUTPUT_FAIL_STATUSES.has(status))
    return {
      done: true,
      ok: false,
      outcome: "verdict_fail",
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      status: selectPresentValue(status, GATE_OUTPUT_FAIL_STATUS),
      data,
      output,
      gateStatusAuthority: authority,
    };
  if (GATE_OUTPUT_PASS_STATUSES.has(status))
    return {
      done: true,
      ok: true,
      outcome: "target_reached",
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      status,
      data,
      output,
      gateStatusAuthority: authority,
    };
  return null;
}

function unsupportedCompletion(gateId: any, output: any, authority: any): any {
  const status = gateOutputStatus(output);
  const invalidReason = status
    ? "unsupported_gate_output_status"
    : "missing_gate_output_status";
  const reason = status
    ? `Gate output contract invalid: unsupported status '${status}'`
    : "Gate output contract invalid: missing status";
  return {
    done: true,
    ok: false,
    outcome: "invalid_contract",
    source: GATE_OUTPUT_EVIDENCE_SOURCE,
    status: "INVALID_OUTPUT",
    data: {
      gate: gateId,
      status: "INVALID_OUTPUT",
      reason,
      invalid_reason: invalidReason,
      observed_status: status || null,
    },
    output,
    gateStatusAuthority: authority,
  };
}

/**
 * Check if a gate's output file exists (regardless of content).
 * Use readGateOutput for content-aware completion checks.
 */
export function gateOutputExists(config: any, gate: any) {
  if (!gate?.output_file) return false;
  const outputPath = gateOutputPath(config, gate);
  return outputPath ? fs.existsSync(outputPath) : false;
}

export function projectGateCompletionState(
  config: any,
  gateId: any,
  gate: any = null,
) {
  const output = readGateOutput(config, gate);
  const gateStatusAuthority = buildGateStatusAuthorityPolicy({ gate, output });

  if (output?.exists) {
    if (output.invalid_contract)
      return invalidCompletion(gateId, output, gateStatusAuthority);
    return (
      verdictCompletion(output, gateStatusAuthority) ??
      unsupportedCompletion(gateId, output, gateStatusAuthority)
    );
  }

  return {
    done: false,
    ok: false,
    outcome: "pending",
    source: null,
    status: null,
    output,
    gateStatusAuthority,
    logMsg: "waiting for output",
  };
}

/**
 * Read the canonical Buster gate completion signal for resume/scheduler/dependency checks.
 *
 * `output_file` is the only completion authority here.
 *
 * @returns {{ isPass: boolean, source: string|null, output: object }}
 */
export function readBusterGateCompletion(config: any, gateId: any, gate: any) {
  void gateId;
  const output = readGateOutput(config, gate);
  if (output.isPass) {
    return {
      isPass: true,
      source: GATE_OUTPUT_EVIDENCE_SOURCE,
      output,
    };
  }

  return {
    isPass: false,
    source: null,
    output,
  };
}

export function readGateCompletionEvidence(
  config: any,
  gateId: any,
  gate: any,
) {
  return readBusterGateCompletion(config, gateId, gate);
}
