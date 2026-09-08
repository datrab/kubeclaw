import assert from 'node:assert/strict';
import { validateDeclarations } from '../../../skills/nova/plugins/preflight-contract/src/stage.ts';
const input = {moduleId:'web',modulePath:'modules/web',ownedPaths:['docker/Dockerfile'],serveDockerfile:'docker/Dockerfile',apiSpecFile:'api/openapi.yaml'};
const text = 'Do not deliver Dockerfile or openapi.yaml. These files belong to another project.';
const result = validateDeclarations(input,text);
assert.deepEqual(result,[]);
console.log(JSON.stringify({negativeDeclarationAccepted:true,result}));
