import assert from 'node:assert/strict';
import {testContract} from '../../../skills/buster/plugins/tailscale-exposure/src/provider.js';
const invocation={inputs:[{name:'deployment',kind:'value',schemaId:'kubeclaw.kubernetes-deployment-fixture@1',value:{schemaVersion:'kubernetes-deployment-fixture.v1',leaseName:'test-a',namespace:'test-a',expiresAt:'2030-01-01T00:00:00.000Z',endpoints:[{name:'web',url:'http://web.test-a.svc.cluster.local:80'}]}}]};
assert.throws(()=>testContract.deploymentInput(invocation), /TAILSCALE_EXPOSURE_INTERNAL_ENDPOINT_INVALID/);
console.log('Confirmed original deploymentInput rejects valid explicit HTTP port 80; URL.port='+JSON.stringify(new URL(invocation.inputs[0].value.endpoints[0].url).port));
