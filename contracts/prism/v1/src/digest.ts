import { createHash } from "node:crypto";
import schema from "../schemas/prism-v1.schema.json" with { type: "json" };
import engineResults from "../schemas/engine-results.v1.json" with { type: "json" };
import engineRequests from "../schemas/engine-requests.v1.json" with { type: "json" };
export function schemaDigest(): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(schema)).digest("hex")}`;
}
export function engineResultSchema(
  operation: "generate" | "render" | "evaluate" | "ingest" | "publish",
  renderPolicyVersion?: unknown,
): { schemaId: string; schemaDigest: string } {
  const key = operation === 'render' && renderPolicyVersion === 'prism-render-policy.v1' ? 'renderSelected' : operation;
  const resultSchema = engineResults.$defs[key];
  return {
    schemaId: `${engineResults.$id}#/$defs/${key}`,
    schemaDigest: `sha256:${createHash("sha256").update(JSON.stringify(resultSchema)).digest("hex")}`,
  };
}
export function engineRequestSchema(
  operation: "generate" | "render" | "evaluate" | "ingest" | "publish",
): { schemaId: string; schemaDigest: string } {
  const requestSchema = engineRequests.$defs[operation];
  return {
    schemaId: `${engineRequests.$id}#/$defs/${operation}`,
    schemaDigest: `sha256:${createHash("sha256").update(JSON.stringify(requestSchema)).digest("hex")}`,
  };
}
