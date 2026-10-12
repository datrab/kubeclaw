import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { resolveSchema, goName } from '../../../../scripts/lib/telemetry-type-generation.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const contract = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(contract, name), 'utf8'));
const sources = { 'correlation_identity.schema.json': read('correlation_identity.schema.json'), 'envelope.schema.json': read('envelope.schema.json') };
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
for (const [name, schema] of Object.entries(sources)) ajv.addSchema(schema, name);
const normalize = (schema) => schema.allOf ? Object.assign({}, ...schema.allOf.map(normalize)) : schema;
function sample(raw) {
  const schema = normalize(raw);
  if ('const' in schema) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.oneOf) return sample(schema.oneOf[0]);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object') return Object.fromEntries((schema.required ?? []).map((key) => [key, sample(schema.properties[key])]));
  if (type === 'array') return Array.from({ length: schema.minItems ?? 0 }, () => sample(schema.items ?? {}));
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'integer') return schema.minimum ?? 0;
  if (type !== 'string') return null;
  if (schema.format === 'date-time') return '2026-09-09T00:00:00Z';
  if (schema.pattern?.startsWith('^blobs/')) return `blobs/sha256/aa/${'a'.repeat(62)}`;
  if (schema.pattern) return 'a'.repeat(64);
  return 'value';
}
function variants(raw) {
  const schema = normalize(raw);
  const values = [sample(schema)];
  if (schema.oneOf) for (const branch of schema.oneOf) values.push(...variants(branch));
  if (Array.isArray(schema.type)) for (const type of schema.type) values.push(...variants({ ...schema, type }));
  if (schema.enum) values.push(...schema.enum);
  const base = sample(schema);
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) values.push({ ...base, additional: { opaque: false } });
    for (const [name, field] of Object.entries(schema.properties ?? {})) for (const value of variants(field)) values.push({ ...base, [name]: value });
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') for (const value of variants(schema.additionalProperties)) values.push({ ...base, entry: value });
  }
  if (schema.type === 'array' && schema.items) for (const value of variants(schema.items)) values.push([value]);
  for (const value of [null, 0, 1e30, false, '', [], {}, { opaque: false }]) values.push(value);
  const validate = ajv.compile(withoutIds(schema));
  return [...new Map(values.filter((value) => validate(value)).map((value) => [JSON.stringify(value), value])).values()];
}
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, GO111MODULE: 'off' }, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${command} must be installed: ${result.error}`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
const golden = read('fixtures/golden-event.json');
const envelope = resolveSchema(sources['envelope.schema.json'], sources);
const schemas = new Map([['Envelope', envelope], ['CorrelationIdentity', sources['correlation_identity.schema.json']]]);
const catalog = read('catalog.json');
let compiled = 0;
for (const directory of ['payloads', 'events', 'bundle']) {
  for (const name of fs.readdirSync(path.join(contract, directory)).filter((name) => name.endsWith('.schema.json'))) {
    const original = read(`${directory}/${name}`);
    const validate = ajv.compile(original);
    const schema = resolveSchema(original, sources);
    compiled++;
    if (directory !== 'events') schemas.set(`${goName(name.replace('.schema.json', ''))}${directory === 'payloads' ? 'Payload' : ''}`, schema);
    if (directory !== 'events') continue;
    const valid = sample(schema);
    assert.equal(validate(valid), true, JSON.stringify(validate.errors));
    for (const required of envelope.required) { const missing = { ...valid }; delete missing[required]; assert.equal(validate(missing), false, `${name}: missing ${required}`); }
    for (const run_id of [null, '', 0]) assert.equal(validate({ ...valid, run_id }), false, name);
    for (const attempt of [-1, 1.5]) assert.equal(validate({ ...valid, attempt }), false, name);
    for (const attempt of [null, 0, 1]) assert.equal(validate({ ...valid, attempt }), ajv.compile(schema.properties.attempt)(attempt), `${name}: permitted attempt ${attempt}`);
    if (valid.type === golden.type) assert.equal(validate(golden), true, JSON.stringify(validate.errors));
  }
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-contracts-'));
try {
  const vectors = [];
  const tsLines = [];
  for (const [name, schema] of schemas) {
    for (const value of variants(schema)) {
      vectors.push({ type: name, value });
      const filename = name.endsWith('V1') ? 'bundle-types.ts' : 'telemetry-types.ts';
      const type = name === 'Envelope' ? 'TelemetryEnvelope' : name;
      tsLines.push(`export const value${tsLines.length}: import(${JSON.stringify(path.join(contract, filename))}).${type} = ${JSON.stringify(value)};`);
    }
  }
  // Envelope carries a type-specific payload in TS: use actual valid event
  // objects for it, while Go's Envelope represents only the projected base.
  const tsWithoutEnvelope = tsLines.filter((line) => !line.includes('.TelemetryEnvelope ='));
  for (const type of catalog.event_types) tsWithoutEnvelope.push(`export const event${tsWithoutEnvelope.length}: import(${JSON.stringify(path.join(contract, 'telemetry-types.ts'))}).TelemetryEnvelope<${JSON.stringify(type)}> = ${JSON.stringify(sample(resolveSchema(read(`events/${type}.schema.json`), sources)))};`);
  const validEnvelope = { ...golden, cursor: null };
  tsWithoutEnvelope.push(`export const nullableCursor: import(${JSON.stringify(path.join(contract, 'telemetry-types.ts'))}).TelemetryEnvelope<'agent.tool.started'> = ${JSON.stringify(validEnvelope)};`);
  const { extensions: _extensions, ...missingExtensions } = validEnvelope;
  tsWithoutEnvelope.push(`// @ts-expect-error extensions is required by the wire contract\nexport const missingExtensions: import(${JSON.stringify(path.join(contract, 'telemetry-types.ts'))}).TelemetryEnvelope<'agent.tool.started'> = ${JSON.stringify(missingExtensions)};`);
  tsWithoutEnvelope.push(`// @ts-expect-error provenance is required inside extensions\nexport const missingProvenance: import(${JSON.stringify(path.join(contract, 'telemetry-types.ts'))}).TelemetryEnvelope<'agent.tool.started'> = ${JSON.stringify({ ...validEnvelope, extensions: {} })};`);
  fs.writeFileSync(path.join(temporary, 'vectors.ts'), tsWithoutEnvelope.join('\n'));
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ESNext', '--allowImportingTsExtensions', path.join(temporary, 'vectors.ts')]);
  for (const filename of ['telemetry_types.go', 'bundle_types.go']) fs.copyFileSync(path.join(contract, filename), path.join(temporary, filename));
  fs.writeFileSync(path.join(temporary, 'vectors.json'), JSON.stringify(vectors));
  fs.writeFileSync(path.join(temporary, 'roundtrip_test.go'), `package telemetryv1
import("bytes";"encoding/json";"os";"reflect";"testing")
func TestExactDecimalWire(t *testing.T) {
 input:=[]byte("{\\"threshold\\":0,\\"current\\":12345678901234567890.123,\\"limit\\":1,\\"unit\\":\\"usd\\"}")
 var value BudgetExceededPayload
 if e:=json.Unmarshal(input,&value);e!=nil{t.Fatal(e)}
 output,e:=json.Marshal(value);if e!=nil{t.Fatal(e)}
 if !bytes.Contains(output,[]byte("12345678901234567890.123")){t.Fatalf("decimal precision lost: %s",output)}
}
func TestExactNumericFields(t *testing.T) {
 for _,target:=range []any{&LifecycleSnapshotPayload{},&AgentToolFinishedPayload{}} {
 input:=[]byte("{\\"event_count\\":12345678901234567890.123,\\"result_bytes\\":12345678901234567890.123}")
 if e:=json.Unmarshal(input,target);e!=nil{t.Fatal(e)}
 output,e:=json.Marshal(target);if e!=nil{t.Fatal(e)}
 if !bytes.Contains(output,[]byte("12345678901234567890.123")){t.Fatalf("numeric field precision lost: %s",output)}
 }
}
func TestSchemaValidRoundtrips(t *testing.T) {
 b,e:=os.ReadFile("vectors.json");if e!=nil{t.Fatal(e)}
 var cases []struct {Type string; Value json.RawMessage};if e=json.Unmarshal(b,&cases);e!=nil{t.Fatal(e)}
 for i,c:=range cases{var target any;switch c.Type {${[...schemas.keys()].map((name) => `case ${JSON.stringify(name)}: target=&${name}{}`).join(';')};default:t.Fatal(c.Type)}
 if e=json.Unmarshal(c.Value,target);e!=nil{t.Fatalf("%d %s decode: %s",i,c.Type,e)}
 out,e:=json.Marshal(target);if e!=nil{t.Fatal(e)}
 var before,after any; decoder:=json.NewDecoder(bytes.NewReader(c.Value));decoder.UseNumber();decoder.Decode(&before);decoder=json.NewDecoder(bytes.NewReader(out));decoder.UseNumber();decoder.Decode(&after)
 if !reflect.DeepEqual(before,after){t.Fatalf("%d %s roundtrip changed JSON: %s -> %s",i,c.Type,c.Value,out)}
 }
 t.Logf("%d schema-valid union/presence vectors",len(cases))
}
`);
  textOutput(run('go', ['test', '-v', '.'], temporary));
  run(process.execPath, [path.join(root, 'scripts/generate-telemetry-contracts.mjs'), '--check']);
  // Run the actual generator against a copied source tree with a collision.
  const rejectedRoot = path.join(temporary, 'rejected-generator');
  fs.mkdirSync(path.join(rejectedRoot, 'scripts/lib'), { recursive: true });
  fs.cpSync(contract, path.join(rejectedRoot, 'contracts/telemetry/v1'), { recursive: true });
  for (const file of ['generate-telemetry-contracts.mjs', 'lib/telemetry-type-generation.mjs']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(rejectedRoot, 'scripts', file));
  const payloadPath = path.join(rejectedRoot, 'contracts/telemetry/v1/payloads/pipeline.started.schema.json');
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  payload.properties.run_id = { type: ['string', 'null'] };
  fs.writeFileSync(payloadPath, JSON.stringify(payload));
  const rejected = spawnSync(process.execPath, [path.join(rejectedRoot, 'scripts/generate-telemetry-contracts.mjs'), '--check'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /TELEMETRY_ENVELOPE_COLLISION:run_id/);

  const manifest = read('contract-manifest.json');
  for (const file of manifest.files) { const bytes = fs.readFileSync(path.join(contract, file.path)); assert.equal(bytes.length, file.byte_length); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256); }
  console.log(JSON.stringify({ ok: true, eventSchemas: catalog.event_types.length, compiled, wireVectors: vectors.length, manifestFiles: manifest.files.length }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
function textOutput(value) { process.stdout.write(value); }

function withoutIds(value) {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$id').map(([key, item]) => [key, withoutIds(item)]));
}
