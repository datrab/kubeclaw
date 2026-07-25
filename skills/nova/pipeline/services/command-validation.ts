import { COMMAND_TYPES } from "../observability-contract.ts";
import { readNovaEnvironment } from "../core/runtime-environment.ts";
const allowed = new Set(COMMAND_TYPES);
const legalStates: Record<string, Set<string>> = {
  "approval.resolve": new Set(["waiting_approval"]),
  "pipeline.pause": new Set(["running"]),
  "pipeline.resume": new Set(["paused"]),
  "pipeline.cancel": new Set([
    "running",
    "paused",
    "waiting_approval",
    "waiting_dependency",
    "cooldown",
  ]),
};
export function commandControlEnabled(config: any) {
  return (
    config?.control?.enabled === true &&
    readNovaEnvironment("PIPELINE_CONTROL_ENABLED") === "1"
  );
}
type Rule = [string, boolean];
function identityRules(command: any): Rule[] {
  return [
    ["COMMAND_ID_MISSING", !command?.command_id],
    ["COMMAND_TYPE_UNSUPPORTED", !allowed.has(command?.command_type)],
    ["ACTOR_MISSING", !command?.actor],
    ["RATIONALE_MISSING", !command?.reason || !String(command.reason).trim()],
    [
      "COMMAND_ISSUED_AT_INVALID",
      !command?.issued_at || Number.isNaN(Date.parse(command.issued_at)),
    ],
  ];
}
function authorityRules(command: any, context: any): Rule[] {
  return [
    ["CAPABILITY_DENIED", !context.capabilities?.includes(command?.capability)],
    [
      "COMMAND_EXPIRED",
      !command?.expires_at || Date.parse(command.expires_at) <= Date.now(),
    ],
    [
      "LIFECYCLE_VERSION_STALE",
      !Number.isInteger(command?.expected_lifecycle_version) ||
        command.expected_lifecycle_version !== context.lifecycle_version,
    ],
  ];
}
function targetRules(command: any, context: any): Rule[] {
  return [
    [
      "PROJECT_MISMATCH",
      Boolean(command?.project && command.project !== context.project),
    ],
    [
      "RUN_MISMATCH",
      Boolean(command?.run_id && command.run_id !== context.run_id),
    ],
    [
      "TARGET_RUN_MISMATCH",
      Boolean(
        command?.target?.run_id && command.target.run_id !== context.run_id,
      ),
    ],
  ];
}
function typeRules(command: any, context: any): Rule[] {
  const approval = command?.command_type === "approval.resolve";
  const legal = legalStates[command?.command_type];
  return [
    [
      "APPROVAL_DECISION_INVALID",
      approval && !["approve", "reject"].includes(command?.decision),
    ],
    ["APPROVAL_GATE_TARGET_MISSING", approval && !command?.target?.gate_id],
    [
      "COMMAND_ILLEGAL_STATE",
      Boolean(
        allowed.has(command?.command_type) &&
          !legal?.has(String(context.pipeline_state || "")),
      ),
    ],
  ];
}
export function validateCommand(
  command: any,
  context: any,
): { ok: boolean; errors: string[] } {
  const rules = [
    ...identityRules(command),
    ...authorityRules(command, context),
    ...targetRules(command, context),
    ...typeRules(command, context),
  ];
  const errors = rules.filter(([, invalid]) => invalid).map(([code]) => code);
  return { ok: errors.length === 0, errors };
}
