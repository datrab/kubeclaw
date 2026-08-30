import assert from 'node:assert/strict';
import {
  authorizeProxiedSpiffePeer,
  authorizeSpiffePeer,
  spiffePeerFromForwardedClientCertificate,
} from '../../../skills/worker/core/worker/trust.ts';

const nova = 'spiffe://kubeclaw.internal/ns/kubeclaw/sa/nova';
const headers = { 'x-forwarded-client-cert': `By=spiffe://kubeclaw.internal/proxy;Hash=abc;URI=${nova}` };
assert.equal(spiffePeerFromForwardedClientCertificate(headers).spiffeId, nova);
assert.equal(spiffePeerFromForwardedClientCertificate({
  'x-forwarded-client-cert': `By=proxy;URI=\"${nova}\";Hash=abc`,
}).spiffeId, nova);
assert.equal(authorizeSpiffePeer(headers, new Set([nova])).spiffeId, nova);
assert.equal(authorizeProxiedSpiffePeer(headers, '127.0.0.1', new Set([nova])).spiffeId, nova);
assert.equal(authorizeProxiedSpiffePeer(headers, '::1', new Set([nova])).spiffeId, nova);
assert.equal(authorizeProxiedSpiffePeer(headers, '::ffff:127.0.0.1', new Set([nova])).spiffeId, nova);
assert.throws(() => authorizeProxiedSpiffePeer(headers, '10.42.1.7', new Set([nova])), /PROXY_REQUIRED/u);
assert.throws(() => authorizeProxiedSpiffePeer(headers, undefined, new Set([nova])), /PROXY_REQUIRED/u);
assert.throws(() => authorizeSpiffePeer(headers,
  new Set(['spiffe://kubeclaw.internal/ns/kubeclaw/sa/prism-control'])), /FORBIDDEN/u);
assert.throws(() => spiffePeerFromForwardedClientCertificate({}), /MISSING/u);
assert.throws(() => spiffePeerFromForwardedClientCertificate({
  'x-forwarded-client-cert': [headers['x-forwarded-client-cert'], headers['x-forwarded-client-cert']],
}), /MISSING/u);
assert.throws(() => spiffePeerFromForwardedClientCertificate({
  'x-forwarded-client-cert': `${headers['x-forwarded-client-cert']},URI=${nova}`,
}), /MISSING/u);
assert.throws(() => spiffePeerFromForwardedClientCertificate({
  'x-forwarded-client-cert': `URI=${nova};URI=${nova}`,
}), /INVALID/u);
assert.throws(() => spiffePeerFromForwardedClientCertificate({
  'x-forwarded-client-cert': 'URI=spiffe://KUBECLAW.internal/ns/kubeclaw/sa/nova',
}), /INVALID/u);
assert.throws(() => authorizeSpiffePeer(headers, new Set()), /POLICY_INVALID/u);
assert.throws(() => authorizeSpiffePeer(headers, new Set(['not-a-spiffe-id'])), /POLICY_INVALID/u);

console.log(JSON.stringify({ ok: true, contract: 'worker-trust-spiffe' }));
