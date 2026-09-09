// Code generation helpers only; JSON Schema remains the runtime validator.
export function resolveSchema(schema, sources) {
  if (Array.isArray(schema)) return schema.map((value) => resolveSchema(value, sources));
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    const [file, fragment = ''] = schema.$ref.split('#');
    let target = sources[file.replace(/^\.\.\//u, '')];
    if (!target) throw new Error(`TELEMETRY_SCHEMA_REF_UNKNOWN:${schema.$ref}`);
    for (const part of fragment.split('/').filter(Boolean)) target = target?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (!target) throw new Error(`TELEMETRY_SCHEMA_REF_UNKNOWN:${schema.$ref}`);
    const { $ref: _reference, ...rest } = schema;
    const resolved = resolveSchema(target, sources);
    return Object.keys(rest).length ? { allOf: [resolved, resolveSchema(rest, sources)] } : resolved;
  }
  return Object.fromEntries(Object.entries(schema).map(([name, value]) => [name, resolveSchema(value, sources)]));
}
function supported(schema) {
  for (const keyword of ['anyOf', 'not', 'if', 'then', 'else', 'patternProperties', 'prefixItems']) {
    if (Object.hasOwn(schema, keyword)) throw new Error(`TELEMETRY_TYPE_FORM_UNSUPPORTED:${keyword}`);
  }
}
export function tsType(schema = {}) {
  supported(schema);
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.oneOf) return schema.oneOf.map((value) => `(${tsType(value)})`).join(' | ');
  if (schema.allOf) return schema.allOf.map((value) => `(${tsType(value)})`).join(' & ');
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  return types.map((type) => tsBase(type, schema)).join(' | ') || 'unknown';
}
function tsBase(type, schema) {
  if (type === 'integer' || type === 'number') return 'number';
  if (['string', 'boolean', 'null'].includes(type)) return type;
  if (type === 'array') return `Array<${tsType(schema.items)}>`;
  if (type !== 'object') throw new Error(`TELEMETRY_TS_TYPE_UNSUPPORTED:${type}`);
  const extra = schema.additionalProperties && typeof schema.additionalProperties === 'object' ? tsType(schema.additionalProperties) : 'unknown';
  if (!schema.properties) return `Record<string, ${extra}>`;
  const fields = `{ ${Object.entries(schema.properties).map(([name, value]) => `${JSON.stringify(name)}${(schema.required || []).includes(name) ? '' : '?'}: ${tsType(value)}`).join('; ')} }`;
  return schema.additionalProperties === false ? fields : `(${fields} & Record<string, ${extra}>)`;
}
function schemaTypes(schema) {
  if (schema.const !== undefined) return [schema.const === null ? 'null' : typeof schema.const];
  if (schema.enum) return [...new Set(schema.enum.map((value) => value === null ? 'null' : typeof value))];
  if (schema.oneOf) return [...new Set(schema.oneOf.flatMap(schemaTypes))];
  if (schema.allOf) return schemaTypes(schema.allOf.find((item) => ['type', 'enum', 'const'].some((key) => Object.hasOwn(item, key))) ?? {});
  return Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
}
export function goType(schema = {}, required = true) {
  supported(schema);
  const types = schemaTypes(schema);
  const nonNull = types.filter((type) => type !== 'null');
  // Raw JSON retains every heterogeneous branch. Optional nullable properties
  // also need it: a nil pointer cannot distinguish explicit null from absence.
  if (nonNull.length !== 1 || (!required && types.includes('null'))) return 'json.RawMessage';
  if (schema.oneOf?.filter((item) => schemaTypes(item).some((type) => type !== 'null')).length > 1) return 'json.RawMessage';
  const branches = schema.oneOf ?? schema.allOf;
  const selected = branches?.find((item) => schemaTypes(item).includes(nonNull[0])) ?? schema;
  const base = goBase(nonNull[0], selected);
  if (base === 'json.RawMessage') return base;
  return !required || types.includes('null') ? `*${base}` : base;
}
function goBase(type, schema) {
  const primitive = { string: 'string', integer: 'json.Number', number: 'json.Number', boolean: 'bool' };
  if (primitive[type]) return primitive[type];
  if (type === 'array') return `[]${goType(schema.items)}`;
  if (type !== 'object') throw new Error(`TELEMETRY_GO_TYPE_UNSUPPORTED:${type}`);
  // Open records must preserve their additional properties on decode/re-encode.
  if (schema.properties && schema.additionalProperties === false) return `struct { ${goFields(schema).join('; ')} }`;
  return schema.additionalProperties && typeof schema.additionalProperties === 'object' ? `map[string]${goType(schema.additionalProperties)}` : 'json.RawMessage';
}
export function goName(value) { return value.split(/[^a-zA-Z0-9]+/u).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(''); }
export function goFields(schema, names = {}) {
  return Object.entries(schema.properties || {}).map(([name, value]) => {
    const required = (schema.required || []).includes(name);
    return `${names[name] ?? goName(name)} ${goType(value, required)} \`json:"${name}${required ? '' : ',omitempty'}"\``;
  });
}
export function assertEnvelopeReferences(payload, envelope) {
  for (const [name, value] of Object.entries(payload.properties ?? {})) {
    if (!Object.hasOwn(envelope.properties, name)) continue;
    const reference = value.$ref ?? value.allOf?.[0]?.$ref;
    if (reference !== `../envelope.schema.json#/properties/${name}`) throw new Error(`TELEMETRY_ENVELOPE_COLLISION:${name}`);
  }
}
