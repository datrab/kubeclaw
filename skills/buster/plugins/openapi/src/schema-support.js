// Deliberately bounded OpenAPI 3.0/3.1 schema subset. Unsupported assertions
// must fail closed, including children that the current payload never visits.
const ANNOTATIONS = new Set(['title', 'description', 'default', 'example', 'examples',
  'deprecated', 'readOnly', 'writeOnly', 'externalDocs', 'xml']);
const ASSERTIONS = new Set(['$ref', '$defs', 'definitions', 'type', 'nullable', 'const', 'enum',
  'allOf', 'anyOf', 'oneOf', 'not', 'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems',
  'uniqueItems', 'items', 'minProperties', 'maxProperties', 'required', 'properties', 'additionalProperties']);
const TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
function invalid() { throw new Error('OPENAPI_SCHEMA_INVALID'); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function shape(schema, spec) {
  for (const key of Object.keys(schema)) {
    if (!ASSERTIONS.has(key) && !ANNOTATIONS.has(key) && !key.startsWith('x-')) {
      throw new Error(`OPENAPI_SCHEMA_KEYWORD_UNSUPPORTED:${key}`);
    }
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.length || types.some((type) => !TYPES.has(type))) invalid();
  }
  numericShape(schema, spec);
  scalarShape(schema);
}
function numericShape(schema, spec) {
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties']) {
    if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0)) invalid();
  }
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
    if (schema[key] === undefined) continue;
    const exclusive30 = spec.openapi.startsWith('3.0.') && key.startsWith('exclusive');
    if (exclusive30 ? typeof schema[key] !== 'boolean' : typeof schema[key] !== 'number') invalid();
  }
}
function scalarShape(schema) {
  for (const key of ['nullable', 'uniqueItems']) if (schema[key] !== undefined && typeof schema[key] !== 'boolean') invalid();
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) invalid();
  if (schema.required !== undefined && (!Array.isArray(schema.required)
    || schema.required.some((key) => typeof key !== 'string'))) invalid();
  if (schema.pattern !== undefined && typeof schema.pattern !== 'string') invalid();
  if (schema.format !== undefined && !['uuid', 'date-time'].includes(schema.format)) {
    throw new Error(`OPENAPI_SCHEMA_FORMAT_UNSUPPORTED:${String(schema.format)}`);
  }
}
export function assertSupportedSchema(raw, spec, resolve, depth = 0) {
  if (raw === undefined || typeof raw === 'boolean') return;
  if (depth > 64) throw new Error('OPENAPI_SCHEMA_DEPTH_EXCEEDED');
  if (!object(raw)) invalid();
  shape(raw, spec);
  if (raw.$ref !== undefined) {
    if (Object.keys(raw).some((key) => key !== '$ref' && !ANNOTATIONS.has(key) && !key.startsWith('x-'))) {
      throw new Error('OPENAPI_SCHEMA_REF_SIBLINGS_UNSUPPORTED');
    }
    assertSupportedSchema(resolve(spec, raw), spec, resolve, depth + 1);
    return;
  }
  children(raw, spec, resolve, depth);
}
function children(raw, spec, resolve, depth) {
  for (const key of ['items', 'not', 'additionalProperties']) {
    if (Object.hasOwn(raw, key)) assertSupportedSchema(raw[key], spec, resolve, depth + 1);
  }
  for (const key of ['properties', '$defs', 'definitions']) {
    if (raw[key] === undefined) continue;
    if (!object(raw[key])) invalid();
    for (const child of Object.values(raw[key])) assertSupportedSchema(child, spec, resolve, depth + 1);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (raw[key] === undefined) continue;
    if (!Array.isArray(raw[key]) || !raw[key].length) invalid();
    for (const child of raw[key]) assertSupportedSchema(child, spec, resolve, depth + 1);
  }
}
