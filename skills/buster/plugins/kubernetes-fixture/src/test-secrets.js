const ID = /^[a-z][a-z0-9-]{0,39}$/u;
const NAME = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const KEY = /^[A-Za-z0-9._-]{1,128}$/u;
const REF = /\$\{([a-z][a-z0-9-]{0,39})(?:\.(ca|cert|key))?\}/gu;
const fail = () => { throw new Error('KUBERNETES_FIXTURE_TEST_SECRETS_INVALID'); };
function entries(value, min, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const items = Object.entries(value);
  if (items.length < min || items.length > max) fail();
  return items;
}
function generator([id, value]) {
  if (!ID.test(id)) fail();
  if (entries(value, 1, 4).some(([key]) => !['kind', 'bytes', 'encoding', 'host'].includes(key))) fail();
  if (value.kind === 'random') return random(value);
  if (value.kind === 'tls') return tls(value);
  fail();
}
function random(value) {
  if (!Number.isInteger(value.bytes) || value.bytes < 16 || value.bytes > 64 || value.host !== undefined) fail();
  if (!['hex', 'base64', 'base64url'].includes(value.encoding)) fail();
}
function tls(value) {
  if (typeof value.host !== 'string' || !NAME.test(value.host) || value.bytes !== undefined || value.encoding !== undefined) fail();
}
function reference(values, [, id, field]) {
  const value = Object.hasOwn(values, id) ? values[id] : undefined;
  if (!value) fail();
  if (value.kind === 'tls' && !field) fail();
  if (value.kind === 'random' && field) fail();
}
function secret(values, [name, data]) {
  if (!NAME.test(name) || name.startsWith('buster-test-secrets-journal')) fail();
  for (const [key, template] of entries(data, 1, 32)) {
    validateKey(key);
    if (typeof template !== 'string' || template.length < 1 || Buffer.byteLength(template) > 4096) fail();
    if (template.replace(REF, '').includes('${')) fail();
    [...template.matchAll(REF)].forEach(ref => reference(values, ref));
  }
}
/** Public templates only; generated material never enters this request/result. */
export function testSecretContract(raw) {
  if (raw === undefined) return undefined;
  if (Buffer.byteLength(JSON.stringify(raw)) > 32768) fail();
  if (entries(raw, 2, 2).some(([key]) => !['values', 'secrets'].includes(key))) fail();
  entries(raw.values, 1, 32).forEach(generator);
  entries(raw.secrets, 1, 16).forEach(entry => secret(raw.values, entry));
  return JSON.parse(JSON.stringify(raw));
}
function assertScope(scope) {
  if (!scope.fullStack || scope.namespacePrefix !== 'test' || scope.retentionSeconds > 3600 || scope.familyclawBootstrap) fail();
}
function visitBindings(value, allowed, contract) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach(child => visitBindings(child, allowed, contract));
  assertSecretReferences(value, allowed, contract);
  Object.values(value).forEach(child => visitBindings(child, allowed, contract));
}
function assertSecretReferences(value, allowed, contract) {
  if (value.csi || value.flexVolume || value.imagePullSecrets?.length) fail();
  const refs = [value.secretKeyRef?.name, value.secretRef?.name, value.secret?.secretName, value.secret?.name];
  if (refs.some(name => name !== undefined && !allowed.has(name))) fail();
  assertSecretKey(value.secretKeyRef, contract);
}
function assertSecretKey(ref, contract) {
  if (!ref || !Object.hasOwn(contract.secrets, ref.name)) return;
  if (!Object.hasOwn(contract.secrets[ref.name], ref.key)) fail();
}
export function validateTestSecretBindings(contract, documents, scope) {
  if (!contract) return;
  assertScope(scope);
  const names = new Set(Object.keys(contract.secrets));
  const copied = scope.secretReferences ?? [];
  if (copied.some(name => names.has(name)) || names.has(scope.testCredentials?.secretName)) fail();
  const credentials = scope.testCredentials ? [scope.testCredentials.secretName] : [];
  const allowed = new Set([...names, ...copied, ...credentials]);
  documents.forEach(value => visitBindings(value, allowed, contract));
}

function validateKey(key) { if (!KEY.test(key) || key === '.' || key.startsWith('..')) fail(); }
