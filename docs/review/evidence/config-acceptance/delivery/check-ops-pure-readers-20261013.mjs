// Current pure constructor/config/auth parser controls ONLY; never call GET, listen, file credentials or native Hubble.
import {createKubeRequest} from '../../../../../tools/ops-mcp/src/kubernetes.mjs';
import {loadOpsMcpConfig} from '../../../../../tools/ops-mcp/src/config.mjs';
import {createBearerAuthorization} from '../../../../../tools/ops-mcp/src/authentication.mjs';
import {queryWindow} from '../../../../../tools/ops-mcp/src/hubble.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(out,'../../../../..'),records=[];
function observation(id,fn,expect){let observed,error;try{observed=fn();}catch(e){error=e.message;}const valid=expect==='accept'?error===undefined:typeof error==='string'&&error===expect;records.push({id,expected:expect,observedType:typeof observed,diagnostic:error??null,result:valid?'passed':'failed',scope:'actual pure current source parser/constructor only; no invocation/request/readFile/spawn/listen or deployed/nativegrant effect'});}
const originError='KUBERNETES_API_URL must be an HTTPS origin without credentials or a path';
observation('DLV-C0-DLS-OPS-HTTPS-CONSTRUCTOR',()=>createKubeRequest({api:'https://127.0.0.1:18443',tokenFile:'/not-read/token',caFile:'/not-read/ca',timeoutMs:10000,maxBytes:8388608}),'accept');
for(const [label,url] of [['PLAINHTTP','http://127.0.0.1:18443'],['PATH','https://127.0.0.1:18443/extra'],['USERINFO','https://user@127.0.0.1:18443'],['QUERY','https://127.0.0.1:18443/?x=1'],['HASH','https://127.0.0.1:18443/#x']])observation('DLV-C0-DLS-OPS-ORIGIN-'+label,()=>createKubeRequest({api:url}),originError);
observation('DLV-C0-DLS-OPS-WEAK-ZERO-TIMEOUT-COUNTEREXAMPLE',()=>createKubeRequest({api:'https://127.0.0.1:18443',timeoutMs:0}),'accept');
observation('DLV-C0-DLS-OPS-WEAK-NEGATIVE-BYTES-COUNTEREXAMPLE',()=>createKubeRequest({api:'https://127.0.0.1:18443',maxBytes:-1}),'accept');
observation('DLV-C0-DLS-OPS-PORT-OUTSIDE',()=>loadOpsMcpConfig({PORT:'65536'}),'Invalid Ops MCP listen port');
observation('DLV-C0-DLS-OPS-CURRENT-PORT-ZERO',()=>loadOpsMcpConfig({PORT:'0',HOST:'127.0.0.1',OPS_LOCAL_ONLY:'1',OPS_DEFAULT_NAMESPACE:'dlv-a',ARGOCD_NAMESPACE:'argocd',OPS_ALLOWED_NAMESPACES:'dlv-a'}),'accept');
observation('DLV-C0-DLS-OPS-LOCALONLY-HOST',()=>loadOpsMcpConfig({HOST:'0.0.0.0',OPS_LOCAL_ONLY:'1'}),'Local-only MCP requires HOST=127.0.0.1');
observation('DLV-C0-DLS-OPS-MISSING-DEFAULT-NAMESPACE',()=>loadOpsMcpConfig({OPS_DEFAULT_NAMESPACE:'dlv-a',OPS_ALLOWED_NAMESPACES:'dlv-b'}),'OPS_ALLOWED_NAMESPACES must contain valid, explicit namespaces including OPS_DEFAULT_NAMESPACE');
observation('DLV-C0-DLS-OPS-AUTH-BOTH-SOURCES',()=>createBearerAuthorization({file:'/never-read',token:'invalid-test-data'}),'Configure exactly one Ops MCP bearer token source');
observation('DLV-C0-DLS-OPS-AUTH-MISSING',()=>createBearerAuthorization(),'Ops MCP requires a bearer token of 32–512 URL-safe characters');
observation('DLV-C0-DLS-OPS-WINDOW-POSITIVE',()=>queryWindow({startTime:'2026-10-13T00:00:00Z',endTime:'2026-10-13T00:05:00Z'},0),'accept');
observation('DLV-C0-DLS-OPS-WINDOW-OUTSIDE',()=>queryWindow({startTime:'2026-10-13T00:00:00Z',endTime:'2026-10-13T00:15:01Z'},0),'Choose startTime < endTime with at most 15 minutes per query. Older absolute windows are allowed.');
const files=[fileURLToPath(import.meta.url),...['kubernetes','config','authentication','hubble','diagnostics'].map(x=>path.join(repo,'tools/ops-mcp/src',x+'.mjs'))],sourceDigests=Object.fromEntries(files.map(p=>[path.relative(repo,p),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const document={scope:'current pure config/auth/window/HTTPS constructor observations, including weak source counterexamples; no credential file/APIrequest/network/childprocess/native service/account/image action',records,sourceDigests,tools:{node:process.version},acceptance:'NOT ACCEPTED; future target rejection/effect controls remain not-run'};fs.writeFileSync(path.join(out,'ops-pure-reader-controls-20261013.json'),JSON.stringify(document,null,2)+'\n');console.log(JSON.stringify({records:records.length,failed:records.filter(x=>x.result==='failed').length,scope:document.scope}));if(records.some(x=>x.result==='failed'))process.exitCode=1;
