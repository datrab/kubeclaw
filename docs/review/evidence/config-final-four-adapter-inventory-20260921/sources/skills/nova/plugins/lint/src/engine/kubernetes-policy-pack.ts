import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fail, record, repoRelative, stringList, text } from './policy-validation.ts';

const PACK_SCHEMA_VERSION = 'kubernetes_lint_policy_pack.v1';
const RULE_TYPES = new Set([
  'required-env',
  'secret-ref',
  'private-registry-pull-secret',
  'readiness-probe',
  'liveness-probe',
  'resource-limits',
]);
const SEVERITIES = new Set(['warning', 'error']);
const MAX_PACK_BYTES = 1_048_576;
const MAX_PACK_RULES = 256;

type AnyRecord = Record<string, any>;

function exactKeys(value: AnyRecord, allowed: readonly string[], field: string): void {
  const known = new Set(allowed);
  for (const key of Object.keys(value)) if (!known.has(key)) fail(`${field}.${key}`, 'unknown field');
}

function unique(values: string[], field: string): string[] {
  if (new Set(values).size !== values.length) fail(field, 'duplicate values are not allowed');
  return values;
}

function parametersForRule(type: string, input: unknown, field: string): AnyRecord {
  const value = input === undefined ? {} : record(input, field);
  if (type === 'required-env') {
    exactKeys(value, ['names'], field);
    return { names: unique(stringList(value.names, `${field}.names`, { nonEmpty: true }), `${field}.names`) };
  }
  if (type === 'private-registry-pull-secret') {
    exactKeys(value, ['registries'], field);
    return { registries: unique(stringList(value.registries, `${field}.registries`, { nonEmpty: true }), `${field}.registries`) };
  }
  if (type === 'resource-limits') {
    exactKeys(value, ['cpu', 'memory'], field);
    const cpu = value.cpu === undefined ? true : value.cpu;
    const memory = value.memory === undefined ? true : value.memory;
    if (typeof cpu !== 'boolean') fail(`${field}.cpu`, 'required boolean');
    if (typeof memory !== 'boolean') fail(`${field}.memory`, 'required boolean');
    if (!cpu && !memory) fail(field, 'at least one resource limit must be required');
    return { cpu, memory };
  }
  exactKeys(value, [], field);
  return {};
}

function validateRule(input: unknown, field: string): AnyRecord {
  const rule = record(input, field);
  exactKeys(rule, ['id', 'type', 'severity', 'parameters'], field);
  const id = text(rule.id, `${field}.id`);
  const type = text(rule.type, `${field}.type`);
  const severity = text(rule.severity, `${field}.severity`);
  if (!/^[a-z][a-z0-9.-]{0,127}$/u.test(id)) fail(`${field}.id`, 'must use lowercase stable identifier syntax');
  if (!RULE_TYPES.has(type)) fail(`${field}.type`, `unsupported rule type '${type}'`);
  if (!SEVERITIES.has(severity)) fail(`${field}.severity`, `unsupported severity '${severity}'`);
  return { id, type, severity, parameters: parametersForRule(type, rule.parameters, `${field}.parameters`) };
}

function validatePackDocument(input: unknown, expected: AnyRecord, sourcePath: string): AnyRecord {
  const pack = record(input, `policy pack ${expected.id}`);
  exactKeys(pack, ['schema_version', 'id', 'version', 'rules'], `policy pack ${expected.id}`);
  if (pack.schema_version !== PACK_SCHEMA_VERSION) fail(`policy pack ${expected.id}.schema_version`, `expected ${PACK_SCHEMA_VERSION}`);
  if (text(pack.id, `policy pack ${expected.id}.id`) !== expected.id) fail(`policy pack ${expected.id}.id`, 'does not match policy reference');
  if (text(pack.version, `policy pack ${expected.id}.version`) !== expected.version) fail(`policy pack ${expected.id}.version`, 'does not match policy reference');
  if (!Array.isArray(pack.rules) || pack.rules.length === 0) fail(`policy pack ${expected.id}.rules`, 'required non-empty array');
  if (pack.rules.length > MAX_PACK_RULES) fail(`policy pack ${expected.id}.rules`, `must contain at most ${MAX_PACK_RULES} rules`);
  const rules = pack.rules.map((entry: unknown, index: number) => validateRule(entry, `policy pack ${expected.id}.rules[${index}]`));
  const ruleIds = rules.map((rule: AnyRecord) => rule.id);
  unique(ruleIds, `policy pack ${expected.id}.rules`);
  return Object.freeze({ schema_version: PACK_SCHEMA_VERSION, id: expected.id, version: expected.version, digest: expected.sha256, bytes: fs.statSync(sourcePath).size, path: sourcePath, rules: Object.freeze(rules) });
}

function validatePackReference(input: unknown, field: string, policyDir: string): AnyRecord {
  const reference = record(input, field);
  exactKeys(reference, ['id', 'version', 'path', 'sha256'], field);
  const id = text(reference.id, `${field}.id`);
  const version = text(reference.version, `${field}.version`);
  if (!/^[a-z][a-z0-9.-]{0,127}$/u.test(id)) fail(`${field}.id`, 'must use lowercase stable identifier syntax');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) fail(`${field}.version`, 'required semantic version');
  const relativePath = repoRelative(reference.path, `${field}.path`);
  const sha256 = text(reference.sha256, `${field}.sha256`);
  if (!/^[a-f0-9]{64}$/u.test(sha256)) fail(`${field}.sha256`, 'required lowercase SHA-256');
  const sourcePath = path.resolve(policyDir, relativePath);
  const relative = path.relative(policyDir, sourcePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${field}.path`, 'escapes policy directory');
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) fail(`${field}.path`, `file does not exist: ${relativePath}`);
  const realPolicyDir = fs.realpathSync(policyDir);
  const realSource = fs.realpathSync(sourcePath);
  const realRelative = path.relative(realPolicyDir, realSource);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail(`${field}.path`, 'symlink escapes policy directory');
  const sourceBytes = fs.statSync(realSource).size;
  if (sourceBytes > MAX_PACK_BYTES) fail(`${field}.path`, `policy pack exceeds ${MAX_PACK_BYTES} bytes`);
  const source = fs.readFileSync(sourcePath);
  const actual = crypto.createHash('sha256').update(source).digest('hex');
  if (actual !== sha256) fail(`${field}.sha256`, `digest mismatch for ${relativePath}`);
  let parsed: unknown;
  try { parsed = JSON.parse(source.toString('utf8')); }
  catch (error: any) { fail(`${field}.path`, `invalid JSON: ${error.message}`); }
  return validatePackDocument(parsed, { id, version, sha256 }, sourcePath);
}

function loadKubernetesPolicyPacks(input: unknown, policyDir: string): AnyRecord[] {
  if (!Array.isArray(input)) fail('policy.kubernetes_policy_packs', 'required array');
  if (input.length > 256) fail('policy.kubernetes_policy_packs', 'must contain at most 256 packs');
  const packs = input.map((entry, index) => validatePackReference(entry, `policy.kubernetes_policy_packs[${index}]`, policyDir));
  unique(packs.map((pack) => pack.id), 'policy.kubernetes_policy_packs');
  return packs;
}

export { PACK_SCHEMA_VERSION, RULE_TYPES, loadKubernetesPolicyPacks };
