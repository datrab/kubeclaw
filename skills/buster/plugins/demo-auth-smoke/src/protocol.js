import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DEMO_AUTH_CONTRACT_INVALID');
  return value;
}
function exact(value, keys) {
  object(value);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => value[key] === undefined)) throw new Error('DEMO_AUTH_CONTRACT_INVALID');
}
function text(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\0\r\n]/u.test(value)) throw new Error('DEMO_AUTH_CONTRACT_INVALID');
  return value;
}
function route(value) {
  text(value);
  const url = new URL(value, 'https://demo.invalid');
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || url.origin !== 'https://demo.invalid' || url.hash || url.search || url.pathname !== value) throw new Error('DEMO_AUTH_PATH_INVALID');
}
function pointer(value) {
  text(value);
  if (!value.startsWith('/') || /~(?:[^01]|$)/u.test(value) || value.split('/').some(key => ['__proto__','constructor','prototype'].includes(key))) throw new Error('DEMO_AUTH_POINTER_INVALID');
}
export function protocol(value) {
  exact(value, ['protocol','loginPath','usernameKey','passwordKey','cookieName','protectedPath','usernamePointer','assertions']);
  if (value.protocol !== 'json-session.v1') throw new Error('DEMO_AUTH_PROTOCOL_UNSUPPORTED');
  route(value.loginPath); route(value.protectedPath); pointer(value.usernamePointer);
  for (const key of ['usernameKey','passwordKey','cookieName']) if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(text(value[key]))) throw new Error('DEMO_AUTH_KEY_INVALID');
  if (value.usernameKey === value.passwordKey) throw new Error('DEMO_AUTH_KEY_INVALID');
  if (!Array.isArray(value.assertions) || !value.assertions.length || value.assertions.length > 16) throw new Error('DEMO_AUTH_BUSINESS_ASSERTION_REQUIRED');
  for (const assertion of value.assertions) {
    exact(assertion, ['pointer','equals']); pointer(assertion.pointer);
    if (assertion.pointer === value.usernamePointer || !['string','number','boolean'].includes(typeof assertion.equals)
      || (typeof assertion.equals === 'number' && !Number.isFinite(assertion.equals))
      || (typeof assertion.equals === 'string' && assertion.equals.length > 2048)) throw new Error('DEMO_AUTH_ASSERTION_INVALID');
  }
  return structuredClone(value);
}
export function jsonPointer(value, pointerValue) {
  return pointerValue.slice(1).split('/').reduce((current, key) => {
    key = key.replaceAll('~1','/').replaceAll('~0','~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current,key)) throw new Error('DEMO_AUTH_ASSERTION_MISSING');
    return current[key];
  }, value);
}
function inputValues(invocation) {
  const schemas = {deployment:'kubeclaw.kubernetes-deployment-fixture@1',credentials:'kubeclaw.generated-demo-credentials@1',exposure:'kubeclaw.public-endpoint-fixture@1'};
  if (invocation.inputs.length !== 3) throw new Error('DEMO_AUTH_INPUT_REQUIRED');
  const values = {};
  for (const input of invocation.inputs) {
    if (!schemas[input.name] || values[input.name] || input.kind !== 'value' || input.schemaId !== schemas[input.name]) throw new Error('DEMO_AUTH_INPUT_INVALID');
    values[input.name] = object(input.value);
  }
  return values;
}
function validateSchemas(d,c,e,source,handoff) {
  if (d.schemaVersion !== 'kubernetes-deployment-fixture.v1' || c.schemaVersion !== 'generated-demo-credentials.v1'
    || e.schemaVersion !== 'public-endpoint-fixture.v1' || e.provider !== 'tailscale-ingress'
    || handoff.schemaVersion !== 'demo-exposure-handoff.v1' || handoff.phase !== 'awaiting-readiness'
    || source.schemaVersion !== 'generated-demo-credential-source.v1') throw new Error('DEMO_AUTH_PROVENANCE_REQUIRED');
}
function validateSource(d,c,e,source,handoff) {
  for (const key of ['leaseName','namespace']) if (text(d[key]) !== c[key] || d[key] !== e[key]) throw new Error('DEMO_AUTH_SOURCE_MISMATCH');
  for (const key of ['immutableImage','manifestDigest']) if (text(d[key]) !== c[key] || d[key] !== handoff[key]) throw new Error('DEMO_AUTH_SOURCE_MISMATCH');
  if (!/@sha256:[a-f0-9]{64}$/u.test(d.immutableImage) || !/^sha256:[a-f0-9]{64}$/u.test(d.manifestDigest)
    || text(source.leaseUID) !== handoff.leaseUID || source.namespace !== d.namespace || source.secretName !== c.secretName) throw new Error('DEMO_AUTH_SOURCE_MISMATCH');
  text(source.secretUID); text(source.secretResourceVersion); text(handoff.owner);
  exact(c.values,['username','password']); text(c.values.username); text(c.values.password);
  if (sha256Text(canonicalJson(c.values)) !== source.credentialDigest) throw new Error('DEMO_AUTH_CREDENTIAL_DIGEST_MISMATCH');
}
export function inputs(invocation) {
  const {deployment:d,credentials:c,exposure:e} = inputValues(invocation);
  const source = object(c.source), handoff = object(e.handoff);
  validateSchemas(d,c,e,source,handoff);validateSource(d,c,e,source,handoff);
  if (d.expiresAt !== e.expiresAt || e.expiresAt !== handoff.expiresAt || !Number.isFinite(Date.parse(e.expiresAt)) || Date.parse(e.expiresAt) <= Date.now()) throw new Error('DEMO_AUTH_EXPOSURE_EXPIRED');
  const url = new URL(text(e.url));
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.href !== e.url) throw new Error('DEMO_AUTH_URL_INVALID');
  return {deployment:d,credentials:c,exposure:e,url};
}
function cookieAttributes(attributes) {
  const attrs = new Map();
  for (const attribute of attributes) {
    const [name,...value] = attribute.split('=');
    if (attrs.has(name.toLowerCase()) || !['path','secure','httponly','samesite','max-age'].includes(name.toLowerCase())) throw new Error('DEMO_AUTH_SESSION_COOKIE_SCOPE_INVALID');
    attrs.set(name.toLowerCase(),value.join('='));
  }
  if ((attrs.has('secure') && attrs.get('secure') !== '') || (attrs.has('httponly') && attrs.get('httponly') !== '')
    || (attrs.has('max-age') && !/^[1-9][0-9]{0,8}$/u.test(attrs.get('max-age')))
    || (attrs.has('samesite') && !['strict','lax','none'].includes(attrs.get('samesite').toLowerCase()))) throw new Error('DEMO_AUTH_SESSION_COOKIE_SCOPE_INVALID');
  return attrs;
}
export function sessionCookie(header, config, url) {
  if (typeof header !== 'string' || header.length > 4096 || /[\r\n,]/u.test(header)) throw new Error('DEMO_AUTH_SESSION_COOKIE_INVALID');
  const [pair,...attributes] = header.split(';').map(value => value.trim());
  if (!pair.startsWith(`${config.cookieName}=`) || !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+=[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/u.test(pair)) throw new Error('DEMO_AUTH_SESSION_COOKIE_INVALID');
  const attrs = cookieAttributes(attributes);
  cookieScope(attrs,config,url);
  return pair;
}

function cookieScope(attrs,config,url) {
  const cookiePath = attrs.get('path');
  if (typeof cookiePath !== 'string' || !cookiePath.startsWith('/') || !attrs.has('httponly')
    || (url.protocol === 'https:' && !attrs.has('secure')) || (url.protocol !== 'https:' && attrs.has('secure'))
    || (attrs.get('samesite')?.toLowerCase() === 'none' && !attrs.has('secure'))) throw new Error('DEMO_AUTH_SESSION_COOKIE_SCOPE_INVALID');
  for (const routeValue of [config.loginPath,config.protectedPath]) if (routeValue !== cookiePath && !routeValue.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`)) throw new Error('DEMO_AUTH_SESSION_COOKIE_SCOPE_INVALID');
}
