import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { protocol, inputs, object, jsonPointer, sessionCookie } from './protocol.js';

function checkedResponse(value) {
  const response = object(value);
  if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599
    || typeof response.body !== 'string' || response.sizeBytes !== Buffer.byteLength(response.body)
    || response.bodyDigest !== sha256Text(response.body)) throw new Error('DEMO_AUTH_HTTP_EVIDENCE_INVALID');
  return response;
}
function protectedBody(response, config, username) {
  if (response.status !== 200 || response.headers?.['content-type'] !== 'application/json') throw new Error('DEMO_AUTH_PROTECTED_RESPONSE_INVALID');
  let body;
  try { body = JSON.parse(response.body); } catch { throw new Error('DEMO_AUTH_PROTECTED_JSON_INVALID'); }
  if (jsonPointer(body,config.usernamePointer) !== username) throw new Error('DEMO_AUTH_IDENTITY_MISMATCH');
  for (const assertion of config.assertions) if (jsonPointer(body,assertion.pointer) !== assertion.equals) throw new Error('DEMO_AUTH_BUSINESS_ASSERTION_FAILED');
}
function receipt(invocation, bound, config, observations) {
  const {deployment:d,credentials:c,exposure:e} = bound;
  return {schemaVersion:'demo-auth-evidence.v1',runId:invocation.runId,planId:invocation.planId,nodeId:invocation.nodeId,
    attemptId:invocation.attemptId,attemptNumber:invocation.attemptNumber,protocolDigest:sha256Text(canonicalJson(config)),
    observedAt:new Date().toISOString(),leaseName:d.leaseName,leaseUID:c.source.leaseUID,namespace:d.namespace,
    immutableImage:d.immutableImage,manifestDigest:d.manifestDigest,credentialDigest:c.source.credentialDigest,
    secretUID:c.source.secretUID,url:e.url,exposureOwner:e.handoff.owner,exposureGeneration:e.handoff.exposureGeneration,expiresAt:e.expiresAt,observations};
}

export function provider() {
  return {async execute(invocation,context) {
    const config = protocol(invocation.configuration.values), bound = inputs(invocation);
    const deadline = Math.min(Date.now()+invocation.timeoutMs,Date.parse(bound.exposure.expiresAt));
    const request = async (route,method,headers,body) => {
      if (context.signal.aborted) throw new Error('DEMO_AUTH_CANCELLED');
      const remaining = deadline-Date.now();
      if (remaining <= 0) throw new Error('DEMO_AUTH_DEADLINE_EXPIRED');
      const url = new URL(route,bound.url);
      if (url.origin !== bound.url.origin) throw new Error('DEMO_AUTH_ORIGIN_MISMATCH');
      const response = await context.invoke('network.http',{operation:'request',resource:{type:'network.url',canonicalId:url.href},
        payload:{method,headers:{accept:'application/json',...headers},...(body === undefined ? {} : {body}),
          timeoutMs:remaining,maximumResponseBytes:65536,responseHeaders:['set-cookie']}});
      if (context.signal.aborted || Date.now() >= deadline) throw new Error('DEMO_AUTH_DEADLINE_EXPIRED');
      return checkedResponse(response);
    };
    const negative = await request(config.protectedPath,'GET',{});
    if (![401,403].includes(negative.status)) throw new Error('DEMO_AUTH_NEGATIVE_CONTROL_FAILED');
    const credentials = bound.credentials.values;
    const login = await request(config.loginPath,'POST',{'content-type':'application/json'},JSON.stringify({[config.usernameKey]:credentials.username,[config.passwordKey]:credentials.password}));
    if (![200,204].includes(login.status)) throw new Error('DEMO_AUTH_LOGIN_FAILED');
    const cookie = sessionCookie(login.headers?.['set-cookie'],config,bound.url);
    const authenticated = await request(config.protectedPath,'GET',{cookie});
    protectedBody(authenticated,config,credentials.username);
    const value = receipt(invocation,bound,config,{unauthenticated:{status:negative.status,bodyDigest:negative.bodyDigest},
      login:{status:login.status,bodyDigest:login.bodyDigest},authenticated:{status:authenticated.status,bodyDigest:authenticated.bodyDigest}});
    if (context.signal.aborted || Date.now() >= deadline) throw new Error('DEMO_AUTH_DEADLINE_EXPIRED');
    context.log('stdout','Declared demo authentication and protected business assertions passed.\n');
    return {schemaVersion:'provider-result.v1',outcome:'passed',summary:'Demo session login, unauthenticated denial and protected business assertions passed.',
      counts:{total:3,passed:3,failed:0,skipped:0},findings:[],metrics:[],evidenceFiles:[],reports:[],
      providerDetails:null,outputs:[{name:'authentication',kind:'value',schemaId:'kubeclaw.demo-auth-evidence@1',value}],exitCode:null,signal:null};
  }};
}
