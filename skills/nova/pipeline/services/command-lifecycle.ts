import fs from "node:fs";
import path from "node:path";
import {
  COMMAND_TYPES,
  sha256,
  stableJson,
} from "../observability-contract.ts";
import { artifactPaths } from "../portable-artifacts.ts";
import { getPipelineArtifactBundle } from "./artifact-bundle.ts";
import { emitEvent } from "./telemetry/dispatch.ts";
import {
  commandControlEnabled,
  validateCommand,
} from "./command-validation.ts";
export {
  commandControlEnabled,
  validateCommand,
} from "./command-validation.ts";

function evidenceFile(config: any) {
  return path.join(
    artifactPaths({
      ...config,
      pipeline_dir: getPipelineArtifactBundle(config).pipeline_dir,
    }).root,
    "commands.jsonl",
  );
}
function history(config: any) {
  try {
    return fs
      .readFileSync(evidenceFile(config), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line));
  } catch {
    return [];
  }
}
function append(
  config: any,
  state: string,
  command: any,
  reasonCode: string | null = null,
  result: any = null,
) {
  const record = {
    schema_version: "pipeline_command_evidence.v1",
    state,
    recorded_at: new Date().toISOString(),
    command_id: command.command_id,
    command_type: command.command_type,
    actor: command.actor,
    capability: command.capability,
    target: command.target ?? null,
    expected_lifecycle_version: command.expected_lifecycle_version,
    reason: String(command.reason || ""),
    reason_code: reasonCode,
    result,
    command_hash: sha256(stableJson(command)),
  };
  const file = evidenceFile(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  return record;
}
async function emitCommandEvidence(
  config: any,
  state: string,
  command: any,
  reasonCode: string | null = null,
  result: any = null,
) {
  const type = `command.${state}`;
  const common = {
    command_id: command.command_id,
    command_type: command.command_type,
    actor: command.actor ?? null,
    target: command.target ?? null,
  };
  const payload =
    state === "requested"
      ? {
          ...common,
          capability: command.capability,
          expires_at: command.expires_at,
          expected_lifecycle_version: command.expected_lifecycle_version,
          decision: command.decision ?? null,
          reason: command.reason,
          issued_at: command.issued_at,
        }
      : state === "rejected"
        ? {
            command_id: command.command_id,
            command_type: command.command_type ?? null,
            actor: command.actor ?? null,
            target: command.target ?? null,
            reason_code: reasonCode,
          }
        : state === "completed"
          ? {
              ...common,
              result: result ?? { status: reasonCode ? "failed" : "completed" },
              reason_code: reasonCode,
            }
          : common;
  await emitEvent({ config }, type, payload, {
    sourceEventId: `command/${command.command_id}/${state}`,
    authorityClass: "pipeline_authority",
  });
}
async function record(
  config: any,
  state: string,
  command: any,
  reasonCode: string | null = null,
  result: any = null,
) {
  const evidence = append(config, state, command, reasonCode, result);
  await emitCommandEvidence(config, state, command, reasonCode, result);
  return evidence;
}
function commandStreamKey(project: string, runId: string) {
  if (!project || !runId) throw new Error("project and run_id are required");
  return `pipeline:commands:${project}:${runId}`;
}
function commandErrorClass(error: any) {
  if (typeof error?.code === "string" && error.code) return error.code;
  if (typeof error?.name === "string" && error.name) return error.name;
  return "Error";
}
export async function processCommand(
  config: any,
  command: any,
  context: any,
  handlers: any,
) {
  const prior = history(config).filter(
    (item: any) => item.command_id === command.command_id,
  );
  const terminal = prior.find((item: any) =>
    ["completed", "rejected"].includes(item.state),
  );
  if (terminal) {
    await record(config, "rejected", command, "COMMAND_DUPLICATE");
    return history(config).at(-1);
  }
  if (!prior.some((item: any) => item.state === "requested"))
    await record(config, "requested", command);
  const check = validateCommand(command, context);
  if (!check.ok) return record(config, "rejected", command, check.errors[0]);
  if (!prior.some((item: any) => item.state === "accepted"))
    await record(config, "accepted", command);
  const handler = handlers[command.command_type];
  if (typeof handler !== "function")
    return record(config, "completed", command, "COMMAND_HANDLER_UNAVAILABLE", {
      status: "failed",
    });
  try {
    const result = await handler(command, context);
    return record(config, "completed", command, null, {
      status: "completed",
      value: result ?? null,
    });
  } catch (error: any) {
    return record(config, "completed", command, "COMMAND_HANDLER_FAILED", {
      status: "failed",
      error_class: commandErrorClass(error),
      message: error?.message ?? String(error),
    });
  }
}
function redisFields(fields: any[]) {
  const result: any = {};
  for (let i = 0; i < fields.length; i += 2)
    result[String(fields[i])] = fields[i + 1];
  return result;
}
function firstEntry(result: any) {
  if (!Array.isArray(result) || !result.length) return null;
  const streams = Array.isArray(result[0]?.[1])
    ? result[0][1]
    : Array.isArray(result[1])
      ? result[1]
      : [];
  return streams[0] ?? null;
}

async function ensureCommandGroup(
  redis: any,
  stream: string,
  group: string,
): Promise<void> {
  try {
    await redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
  } catch (error: any) {
    if (!String(error).includes("BUSYGROUP")) throw error;
  }
}

async function reclaimCommand(
  redis: any,
  stream: string,
  group: string,
  consumer: string,
  idleMs: number,
): Promise<any> {
  try {
    const result = await redis.xautoclaim(
      stream,
      group,
      consumer,
      idleMs,
      "0-0",
      "COUNT",
      1,
    );
    return firstEntry(result);
  } catch (error: any) {
    if (!/unknown command|syntax/i.test(String(error))) throw error;
    return null;
  }
}

async function readFreshCommand(
  redis: any,
  stream: string,
  group: string,
  consumer: string,
): Promise<any> {
  const result = await redis.xreadgroup(
    "GROUP",
    group,
    consumer,
    "COUNT",
    1,
    "BLOCK",
    1000,
    "STREAMS",
    stream,
    ">",
  );
  return firstEntry(result);
}

async function rejectInvalidCommand(
  config: any,
  redis: any,
  stream: string,
  group: string,
  id: string,
  context: any,
): Promise<any> {
  const command = {
    command_id: `invalid-${id}`,
    command_type: "pipeline.cancel",
    actor: "unknown",
    capability: "unknown",
    reason: "invalid JSON",
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1000).toISOString(),
    expected_lifecycle_version: context.lifecycle_version,
  };
  await record(config, "requested", command);
  await record(config, "rejected", command, "COMMAND_JSON_INVALID");
  await redis.xack(stream, group, id);
  return { processed: 1, rejected: true };
}
export async function consumeCommandOnce(
  config: any,
  {
    redis,
    context,
    handlers,
    group = "pipeline-authority",
    consumer = `nova-${process.pid}`,
    reclaim_idle_ms = 30_000,
  }: any,
) {
  if (!commandControlEnabled(config)) return { processed: 0, disabled: true };
  const runId = config._runId ?? config.run_id;
  const stream = commandStreamKey(config.project, runId);
  await ensureCommandGroup(redis, stream, group);
  const entry =
    (await reclaimCommand(redis, stream, group, consumer, reclaim_idle_ms)) ??
    (await readFreshCommand(redis, stream, group, consumer));
  if (!entry) return { processed: 0 };
  const [id, fields] = entry;
  const data = redisFields(fields);
  let command: any;
  try {
    command = JSON.parse(data.data);
  } catch {
    return rejectInvalidCommand(config, redis, stream, group, id, context);
  }
  const evidence = await processCommand(
    config,
    command,
    { ...context, project: config.project, run_id: runId },
    handlers,
  );
  await redis.xack(stream, group, id);
  return { processed: 1, evidence, reclaimed: Boolean(data.__reclaimed) };
}
