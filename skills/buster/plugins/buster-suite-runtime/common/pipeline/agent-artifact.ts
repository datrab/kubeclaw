import fs from 'node:fs';
import path from 'node:path';

const IMMUTABLE_FIELDS = Object.freeze([
  'artifact_type',
  'run_id',
  'module_id',
  'gate_id',
  'attempt',
  'dispatch_id',
  'schema_version',
  'completed_at',
]);

function requiredText(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function atomicWriteJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    JSON.parse(fs.readFileSync(temporary, 'utf8'));
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function agentArtifactContextPath(outputPath: string): string {
  const output = path.resolve(requiredText(outputPath, 'output'));
  return `${output}.identity.json`;
}

export function writeAgentArtifactContext(outputPath: string, envelope: Record<string, unknown>): string {
  const output = path.resolve(requiredText(outputPath, 'output'));
  const immutable = record(envelope, 'envelope');
  const contextPath = agentArtifactContextPath(output);
  atomicWriteJson(contextPath, { output, envelope: immutable });
  return contextPath;
}

export function readAgentArtifactContext(contextPath: string): { output: string; envelope: Record<string, unknown> } {
  const source = path.resolve(requiredText(contextPath, 'context'));
  const context = record(JSON.parse(fs.readFileSync(source, 'utf8')), 'context');
  const output = path.resolve(requiredText(context.output, 'context.output'));
  const envelope = record(context.envelope, 'context.envelope');
  return { output, envelope };
}

export function buildAgentArtifact(
  envelope: Record<string, unknown>,
  semanticPayload: Record<string, unknown>,
): Record<string, unknown> {
  const immutable = record(envelope, 'envelope');
  const semantic = record(semanticPayload, 'semantic payload');
  const forbidden = IMMUTABLE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(semantic, field));
  if (forbidden.length > 0) throw new Error(`semantic payload may not define pipeline-owned fields: ${forbidden.join(',')}`);
  return {
    ...semantic,
    ...immutable,
    completed_at: new Date().toISOString(),
  };
}

export function publishAgentArtifact(contextPath: string, semanticPayload: Record<string, unknown>): Record<string, unknown> {
  const context = readAgentArtifactContext(contextPath);
  const artifact = buildAgentArtifact(context.envelope, semanticPayload);
  atomicWriteJson(context.output, artifact);
  return artifact;
}

export const PIPELINE_OWNED_AGENT_ARTIFACT_FIELDS = IMMUTABLE_FIELDS;
