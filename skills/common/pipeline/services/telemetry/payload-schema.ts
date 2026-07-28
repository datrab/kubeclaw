import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type UnknownRecord = Record<string, any>;
type JsonSchema = Record<string, any>;

export class TelemetryPayloadInvalidError extends Error {
  code = 'TELEMETRY_PAYLOAD_INVALID';
  eventType: string;
  validationErrors: string[];
  constructor(eventType: string, errors: string[] = []) {
    super(`Invalid telemetry payload for '${eventType}': ${errors.join('; ')}`);
    this.name = 'TelemetryPayloadInvalidError';
    this.eventType = eventType;
    this.validationErrors = [...errors];
  }
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packagedContractRoot = path.resolve(moduleDirectory, '../../contracts/telemetry/v1');
const repositoryContractRoot = path.resolve(moduleDirectory, '../../../../../contracts/telemetry/v1');
const contractRoot = fs.existsSync(packagedContractRoot) ? packagedContractRoot : repositoryContractRoot;
const catalog = JSON.parse(fs.readFileSync(path.join(contractRoot, 'catalog.json'), 'utf8'));
function readPayloadSchema(eventType: string): JsonSchema {
  return JSON.parse(fs.readFileSync(path.join(contractRoot, 'payloads', `${eventType}.schema.json`), 'utf8'));
}

export const TELEMETRY_PAYLOAD_EVENT_TYPES: readonly string[] = Object.freeze([...catalog.event_types].sort());
export const TELEMETRY_PAYLOAD_SCHEMAS: Readonly<Record<string, JsonSchema>> = Object.freeze(Object.fromEntries(
  TELEMETRY_PAYLOAD_EVENT_TYPES.map((eventType) => [eventType, readPayloadSchema(eventType)]),
));

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function typeMatches(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function scalarSchemaError(value: unknown, schema: JsonSchema, field: string): string[] | null {
  if (schema.const !== undefined && value !== schema.const) return [`${field} must equal ${JSON.stringify(schema.const)}`];
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate: unknown) => Object.is(candidate, value))) {
    return [`${field} is not an allowed value`];
  }
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 0 && !types.some((type: string) => typeMatches(value, type))) return [`${field} has invalid type`];
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) return [`${field} is below minimum`];
  return null;
}

function stringSchemaError(value: unknown, schema: JsonSchema, field: string): string[] | null {
  if (typeof value !== 'string') return null;
  if (schema.minLength != null && value.length < schema.minLength) return [`${field} is too short`];
  if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) return [`${field} has invalid format`];
  if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) return [`${field} must be an ISO timestamp`];
  return null;
}

function objectSchemaErrors(value: UnknownRecord, schema: JsonSchema, field: string, seen: Set<unknown>): string[] {
  if (!schema.properties) {
    const childSchema = isPlainObject(schema.additionalProperties) ? schema.additionalProperties : {};
    return Object.entries(value).flatMap(([key, child]) => validateSchema(child, childSchema, `${field}.${key}`, seen));
  }
  const errors: string[] = [];
  for (const required of schema.required || []) {
    if (!Object.prototype.hasOwnProperty.call(value, required) || value[required] === undefined) {
      errors.push(`${field}.${required} is required`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const propertySchema = schema.properties[key];
    if (propertySchema) errors.push(...validateSchema(child, propertySchema, `${field}.${key}`, seen));
    else if (schema.additionalProperties === false) errors.push(`${field}.${key} is not allowed`);
    else if (isPlainObject(schema.additionalProperties)) {
      errors.push(...validateSchema(child, schema.additionalProperties, `${field}.${key}`, seen));
    }
  }
  return errors;
}

function validateSchema(value: unknown, schema: JsonSchema, field: string, seen: Set<unknown> = new Set()): string[] {
  const structured = Array.isArray(value) || isPlainObject(value);
  if (structured && seen.has(value)) return [`${field.split('.')[1] ?? field} has invalid type or value`];
  const nextSeen = new Set(seen);
  if (structured) nextSeen.add(value);
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate: JsonSchema) => validateSchema(value, candidate, field, seen).length === 0);
    return matches.length === 1 ? [] : [`${field} must match exactly one allowed schema`];
  }
  const scalarError = scalarSchemaError(value, schema, field);
  if (scalarError) return scalarError;
  const stringError = stringSchemaError(value, schema, field);
  if (stringError) return stringError;
  if (Array.isArray(value)) {
    const itemSchema = schema.items || {};
    return value.flatMap((item, index) => validateSchema(item, itemSchema, `${field}[${index}]`, nextSeen));
  }
  if (isPlainObject(value)) return objectSchemaErrors(value, schema, field, nextSeen);
  return [];
}

export function validateJsonSchema(value:unknown,schema:JsonSchema,field='value'):string[]{return validateSchema(value,schema,field);}

export function validateTelemetryEventPayload(eventType: string, payload: unknown = {}): string[] {
  if (typeof eventType !== 'string' || !eventType.trim()) return ['eventType must be a non-empty string'];
  const schema = TELEMETRY_PAYLOAD_SCHEMAS[eventType];
  if (!schema) return [`eventType '${eventType}' is not registered in the contract catalog`];
  if (!isPlainObject(payload)) return ['payload must be an object'];
  return validateSchema(payload, schema, 'payload');
}

export function assertTelemetryEventPayload(eventType: string, payload: unknown = {}): UnknownRecord {
  const errors = validateTelemetryEventPayload(eventType, payload);
  if (errors.length > 0) throw new TelemetryPayloadInvalidError(eventType, errors);
  return payload as UnknownRecord;
}

const PLUGIN_EVENT_TOP_LEVEL_FIELDS = new Set([
  'module_id','gate_id','gate_type','agent_type','session_key','attempt','dispatch_id','gateway_label',
  'status','outcome','reason','severity','duration_seconds',
]);
export function buildPluginTelemetryPayload(pluginId: string, pluginEvent: string, data: unknown = {}): UnknownRecord {
  const payload: UnknownRecord = { plugin_id: pluginId, plugin_event: pluginEvent, details: {} };
  const source = isPlainObject(data) ? data : { value: data };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (PLUGIN_EVENT_TOP_LEVEL_FIELDS.has(key)) payload[key] = value;
    else if (key === 'details' && isPlainObject(value)) payload.details = { ...payload.details, ...value };
    else payload.details[key] = value;
  }
  return payload;
}
