import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
const registration = manifest.adapters.find(({ id }) => id === 'operator');
assert.ok(registration, 'operator adapter registration is required');
assert.deepEqual(registration.providesCapabilities, ['operator.request']);
assert.deepEqual(registration.requiredCapabilities, ['network.http', 'secrets.read']);

for (const file of ['src/adapter.ts', 'src/adapter.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /node:(?:http|https)/);
  assert.match(source, /secrets\.read/);
  assert.match(source, /network\.http/);
  assert.match(source, /createHmac/);
  assert.doesNotMatch(source, /Bearer\s/);
}

const configSchema = JSON.parse(fs.readFileSync('schemas/config.schema.json', 'utf8'));
assert.equal(configSchema.additionalProperties, false);
assert.equal(
  configSchema.properties.targets.patternProperties[
    '^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$'
  ].additionalProperties,
  false,
);
const payloadSchema = JSON.parse(fs.readFileSync('schemas/payload.schema.json', 'utf8'));
assert.equal(payloadSchema.additionalProperties, false);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.operator-messaging',
  suite: 'package-boundary',
}));
