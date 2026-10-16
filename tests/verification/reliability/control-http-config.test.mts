import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { body } from '../../../skills/prism/server/control-http.ts';
const root = new URL('../../../config/', import.meta.url);
const entry = JSON.parse(fs.readFileSync(new URL('pipeline.config.json', root), 'utf8'));
const selection = { role: 'prism' as const, callerId: 'prism-control' as const,
 serviceInstanceId: 'kubeclaw/prism/prism-control',
 bindings: entry.bindings.filter((b: any) => b.instanceId === 'kubeclaw/prism/prism-control').map(({role: _, ...b}: any) => b) };
const selectedControlProfile = selection.bindings.find((b: any) => b.owner === 'prism-control').profileId;
function request(text: string) { return Object.assign(Readable.from([Buffer.from(text)]), {headers: {'content-type': 'application/json'}}) as unknown as IncomingMessage; }
test('central body limits preserve existing sizes', () => {
 const s = captureSwarmSettings(new URL('pipeline.config.json', root).pathname, selection).components['prism-control']!.settings;
 assert.equal(s.maximumProductControllerTokenCharacters,64000);
 assert.equal(s.maximumProductControllerResponseBytes, 1000000);
 assert.equal(s.maximumArtifactBytes, 6000000); assert.equal(s.maximumJsonBodyBytes, 2000000); assert.equal(s.maximumArtifactUploadBodyBytes, 8500000);
});
test('alternate selected limits govern parsing; missing or invalid limits reject', async t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-http-config-')); t.after(() => fs.rmSync(dir, {recursive:true,force:true})); fs.cpSync(root, dir, {recursive:true});
 const file = path.join(dir, 'components/prism-control.config.json'); const author = JSON.parse(fs.readFileSync(file,'utf8'));
 const settings = author.profiles[selectedControlProfile].settings;
 for (const key of ['maximumJsonBodyBytes','maximumArtifactUploadBodyBytes','maximumProductInputBytes','maximumProductControllerResponseBytes','maximumProductControllerTokenCharacters']) {
  const prior = settings[key]; settings[key] = 4; fs.writeFileSync(file,JSON.stringify(author));
  const selected = captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings[key] as number;
  assert.deepEqual(await body(request('{}  '),selected),{});
  await assert.rejects(body(request('{}   '),selected),/request too large/);
  for (const value of [undefined,0,-1,1.5,'4']) { settings[key]=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(() => captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/); }
  settings[key]=prior;
 }
});
test('body helper cannot silently omit its limit', async () => {
 await assert.rejects(body(request('{}'),undefined as unknown as number),/valid request body limit/);
});

// Exercise the actual route, including rejection before artifact-store writes.
test('selected decoded artifact limit governs upload publication', async t => {
 const {corpusRoutes} = await import('../../../skills/prism/server/corpus-routes.ts');
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-limit-')); t.after(() => fs.rmSync(dir,{recursive:true,force:true})); fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'); const author=JSON.parse(fs.readFileSync(file,'utf8')); const settings=author.profiles[selectedControlProfile].settings;
 settings.maximumArtifactBytes=3;fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 let writes=0; const context={config:selected,artifacts:{put:async (bytes: Buffer)=>{writes++;return {size:bytes.length};}}} as any;
 const response={writeHead(){return this;},end(){}} as any;
 const upload=(bytes: Buffer)=>corpusRoutes(context,Object.assign(request(JSON.stringify({base64:bytes.toString('base64')})),{method:'POST'}),response,new URL('http://localhost/v1/artifacts'));
 assert.equal(await upload(Buffer.alloc(3)),true);assert.equal(writes,1);
 await assert.rejects(upload(Buffer.alloc(4)),/artifact payload/);assert.equal(writes,1);
 for(const value of [undefined,0,-1,1.5,'3']) {settings.maximumArtifactBytes=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}
});

// Aggregate render budget is distinct from the per-upload artifact limit.
test('selected aggregate render budget controls engine and baseline before worker execution', async t => {
 const {engineRoute} = await import('../../../skills/prism/server/engine-route.ts');
 const {baselineAssets} = await import('../../../skills/prism/server/baseline-archive.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'render-budget-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'); const author=JSON.parse(fs.readFileSync(file,'utf8')); const settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.maximumRenderAssetBytes,6000000); settings.maximumRenderAssetBytes=3; fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 const document={assets:{a:{artifact:'a',mediaType:'image/png'},b:{artifact:'b',mediaType:'image/png'}}} as any;
 let secondSize=1, calls=0; const artifacts={get:async(key:string)=>Buffer.alloc(key==='a'?2:secondSize)} as any;
 const context={config:selected,artifacts,repository:{revision:async()=>({document})},runWorker:async()=>{calls++;return {};}} as any;
 const render=()=>engineRoute(context,Object.assign(request(JSON.stringify({operation:'render',baseRevision:1})),{method:'POST'}),{writeHead(){},end(){}} as any,new URL('http://localhost/v1/documents/abc/engine'));
 assert.equal(await render(),true);assert.equal(calls,1);
 assert.equal(Object.keys((await baselineAssets(artifacts,document,selected.maximumRenderAssetBytes as number)).renderAssetSources).length,2);
 secondSize=2; await assert.rejects(render(),/render assets exceed/);assert.equal(calls,1);
 await assert.rejects(baselineAssets(artifacts,document,selected.maximumRenderAssetBytes as number),/render assets exceed/);
 for(const value of [undefined,0,-1,1.5,'3']) {settings.maximumRenderAssetBytes=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}
});

// Dispatch signs raw bytes; preserve authentication ordering and its distinct cap.
test('selected dispatch body budget rejects before signature and database work', async t => {
 const {dispatchRoute}=await import('../../../skills/prism/server/dispatch-route.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dispatch-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.maximumDispatchBodyBytes,2000000);settings.maximumDispatchBodyBytes=4;fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 let queries=0;const context={config:{...selected,spiffeEnabled:false,dispatchSecret:'test'},pool:{query:()=>{queries++;throw Error('unexpected database');}}} as any;
 const dispatch=(text:string)=>dispatchRoute(context,Object.assign(request(text),{method:'POST',headers:{'content-type':'application/json','idempotency-key':'test'}}),{} as any,new URL('http://localhost/v1/dispatch'));
 await assert.rejects(dispatch('{}  '),/invalid dispatch signature/);
 await assert.rejects(dispatch('{}   '),/request too large/);assert.equal(queries,0);
 for(const value of [undefined,0,-1,1.5,'4']){settings.maximumDispatchBodyBytes=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}
});


test('Studio selected body limit rejects excess bytes before upstream fetch', async t => {
 const {handleStudioRequest}=await import('../../../skills/prism/server/studio-request.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-body-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-studio.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const settings=author.profiles.standard.settings;
 const studioSelection={...selection,callerId:'prism-studio' as const,serviceInstanceId:'kubeclaw/prism/prism-studio',bindings:entry.bindings.filter((b:any)=>b.instanceId==='kubeclaw/prism/prism-studio').map(({role:_,...b}:any)=>b)};
 assert.equal(settings.maximumRequestBodyBytes,2000000);settings.maximumRequestBodyBytes=4;fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),studioSelection).components['prism-studio']!.settings;
 let calls=0;const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior;});globalThis.fetch=async()=>{calls++;return new Response(null,{status:204});};
 const {EventEmitter}=await import('node:events');
 const response=Object.assign(new EventEmitter(),{writeHead(){},setHeader(){},end(){},destroyed:false,writableEnded:false}) as any;
 const options={root:dir,control:new URL('http://localhost'),ingressSecret:'test',controlTimeoutMs:1000,maximumRequestBodyBytes:selected.maximumRequestBodyBytes as number};
 const forward=(text:string)=>handleStudioRequest(Object.assign(request(text),{method:'POST',url:'/v1/test'}),response,options);
 await forward('{}  ');assert.equal(calls,1);await assert.rejects(forward('{}   '),/PRISM_STUDIO_REQUEST_TOO_LARGE/);assert.equal(calls,1);
 for(const value of [undefined,0,-1,1.5,'4']){settings.maximumRequestBodyBytes=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),studioSelection),/SWARM_CONFIG_INVALID/);}
 await assert.rejects(handleStudioRequest(Object.assign(request('{}'),{method:'POST',url:'/v1/test'}),response,{...options,maximumRequestBodyBytes:undefined as any}),/PRISM_STUDIO_REQUEST_LIMIT_INVALID/);
});


test('selected ingestion deadlines govern acquisition and cleanup, including failed publication', async t => {
 const {corpusRoutes}=await import('../../../skills/prism/server/corpus-routes.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ingestion-deadlines-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.ingestionAcquireTimeoutMs,30000);assert.equal(settings.ingestionCleanupTimeoutMs,10000);
 settings.ingestionAcquireTimeoutMs=123;settings.ingestionCleanupTimeoutMs=456;fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 const priorFetch=globalThis.fetch, priorTimeout=AbortSignal.timeout; t.after(()=>{globalThis.fetch=priorFetch;AbortSignal.timeout=priorTimeout;});
 const deadlines:number[]=[];AbortSignal.timeout=(ms:number)=>{deadlines.push(ms);return new AbortController().signal;};
 const methods:string[]=[];globalThis.fetch=async(_url,options)=>{methods.push(options!.method!);return options!.method==='DELETE'?new Response(null,{status:204}):Response.json({normalized:{},quarantineDigest:'sha256:'+ 'a'.repeat(64),contentBase64:'eA=='});};
 const context={config:{...selected,ingestionUrl:new URL('http://localhost'),ingestionSecret:'local'},runWorker:async()=>{throw Error('publication sentinel');}} as any;
 await assert.rejects(corpusRoutes(context,Object.assign(request('{}'),{method:'POST'}),{} as any,new URL('http://localhost/v1/corpus')),/corpus acquisition digest mismatch/);
 assert.deepEqual(methods,['POST','DELETE']);assert.deepEqual(deadlines,[123,456]);
 for(const key of ['ingestionAcquireTimeoutMs','ingestionCleanupTimeoutMs']){const prior=settings[key];for(const value of [undefined,0,-1,1.5,'4',2147483648]){settings[key]=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}settings[key]=prior;}
});


test('selected internal evidence cap controls actual artifact route before storage', async t => {
 const {handleInternalArtifact}=await import('../../../skills/prism/server/internal-artifacts.ts');
 const {createHash}=await import('node:crypto');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'internal-evidence-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.maximumInternalEvidenceBytes,134217728);settings.maximumInternalEvidenceBytes=3;fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 let writes=0;const options={maximumInternalEvidenceBytes:selected.maximumInternalEvidenceBytes as number,artifacts:{put:async()=>{writes++;return {};}} as any,spiffeEnabled:false,workerSecret:'fixture',trustedWorkerSpiffeId:'',trustedControlSpiffeId:''};
 const upload=(bytes:Buffer,limit=options.maximumInternalEvidenceBytes)=>handleInternalArtifact(Object.assign(Readable.from([bytes.subarray(0,2),bytes.subarray(2)]),{method:'POST',headers:{authorization:'Bearer fixture'}}) as unknown as IncomingMessage,{writeHead(){},end(){}} as any,new URL('http://localhost/v1/internal/artifacts/sha256:'+createHash('sha256').update(bytes).digest('hex')),{...options,maximumInternalEvidenceBytes:limit});
 assert.equal(await upload(Buffer.alloc(3)),true);assert.equal(writes,1);
 await assert.rejects(upload(Buffer.alloc(4)),/evidence is too large/);assert.equal(writes,1);
 await assert.rejects(upload(Buffer.alloc(1),0),/valid evidence byte limit/);
 for(const value of [undefined,0,-1,1.5,'3']){settings.maximumInternalEvidenceBytes=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}
});


test('selected session lifetime governs signed expiration and both cookie lifetimes', async t => {
 const {sessionRoutes}=await import('../../../skills/prism/server/session-routes.ts');
 const {verifySession,mintSession}=await import('../../../skills/prism/control/session.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'session-lifetime-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'),author=JSON.parse(fs.readFileSync(file,'utf8')),settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.sessionLifetimeSeconds,900);settings.sessionLifetimeSeconds=7;fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 const cookies:string[]=[];const before=Date.now();
 const config={...selected,sessionSecret:'session-fixture',ingressSecret:'ingress-fixture'} as any;
 const response={setHeader(_key:string,value:string[]){cookies.push(...value);},writeHead(){},end(){}} as any;
 const req={method:'POST',headers:{'tailscale-user-login':'fixture','x-prism-ingress-secret':'ingress-fixture'}} as unknown as IncomingMessage;
 assert.equal(await sessionRoutes({config},req,response,new URL('http://localhost/v1/session')),true);
 assert.equal(cookies.length,2);for(const cookie of cookies)assert.match(cookie,/Max-Age=7$/);
 const token=decodeURIComponent(cookies[0]!.split(';')[0]!.slice('prism_session='.length)),session=verifySession(token,'session-fixture');
 assert.ok(session.expiresAt>=before+7000&&session.expiresAt<=Date.now()+7000);
 const fixed=mintSession('fixture','session-fixture',7,1000);assert.equal(verifySession(fixed,'session-fixture',7999).expiresAt,8000);assert.throws(()=>verifySession(fixed,'session-fixture',8000),/expired/);
 for(const value of [undefined,0,-1,1.5,'7',2147484]){settings.sessionLifetimeSeconds=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);assert.throws(()=>mintSession('fixture','session-fixture',value as number),/invalid session lifetime/);}
});


test('ingestion URL is required centrally and rejects non-HTTP or credential-bearing authors', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ingestion-url-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'),author=JSON.parse(fs.readFileSync(file,'utf8')),settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.ingestionUrl,'http://prism-ingestion:8080');
 for(const value of [undefined,'','ftp://example.test','http://user:secret@example.test','http://example.test?query=1',42]){
  settings.ingestionUrl=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
 }
});

test('worker URL is required centrally and rejects non-HTTP or credential-bearing authors', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worker-url-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'),author=JSON.parse(fs.readFileSync(file,'utf8')),settings=author.profiles[selectedControlProfile].settings;
 assert.equal(author.profiles.standard.settings.workerUrl,'http://prism-worker:8080');
 for(const value of [undefined,'','ftp://example.test','http://user:secret@example.test','http://example.test?query=1',42]){
  settings.workerUrl=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
 }
});

test('internal Control URL is required centrally and rejects non-HTTP or credential-bearing authors', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'internal-control-url-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'),author=JSON.parse(fs.readFileSync(file,'utf8')),settings=author.profiles[selectedControlProfile].settings;
 assert.equal(author.profiles.standard.settings.controlInternalUrl,'http://prism-control:8080');
 for(const value of [undefined,'','ftp://example.test','http://user:secret@example.test','http://example.test?query=1',42]){
  settings.controlInternalUrl=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
 }
});

test('controller timeout is required positive bounded central policy', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-timeout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.productControllerTimeoutMs,15000);
 for(const value of [undefined,0,-1,1.5,2147483648,'50']) {settings.productControllerTimeoutMs=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}
 settings.productControllerTimeoutMs=50;fs.writeFileSync(file,JSON.stringify(author));assert.equal(captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings.productControllerTimeoutMs,50);
});

// The selected history budget reaches the real SQL query, not just parsing.
test('selected product history limit governs actual ordered SQL rows', async t => {
 const {PGlite}=await import('@electric-sql/pglite');
 const {generateKeyPairSync}=await import('node:crypto');
 const {mintSession}=await import('../../../skills/prism/control/session.ts');
 const {handleProductDecisions}=await import('../../../skills/prism/server/product-decisions.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'), author=JSON.parse(fs.readFileSync(file,'utf8')), settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.productDecisionHistoryLimit,100);
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE SCHEMA prism; CREATE TABLE prism.product_decision(decision_id text,intent jsonb,created_at timestamptz,actor_id text); CREATE TABLE prism.product_decision_receipt(decision_id text,receipt jsonb);");
 for(const [id,actor] of [['old','operator'],['new','operator'],['other','outsider']]) await db.query("INSERT INTO prism.product_decision VALUES($1,'{}',$2,$3)",[id,id==='old'?'2026-01-01':'2026-01-02',actor]);
 const config={issuer:'test',operators:new Set(['operator']),origin:'https://studio.test',privateKey:generateKeyPairSync('ed25519').privateKey,controller:new URL('https://controller.test'),caFile:'unused',tokenFile:'unused'};
 const token=mintSession('operator','history-secret',900);
 const read=async(limit:number)=>{let result:any,status=0;await handleProductDecisions({method:'GET',headers:{cookie:`prism_session=${token}`}} as any,{setHeader(){},writeHead(code:number){status=code;},end(text:string){result=JSON.parse(text);}} as any,new URL('https://studio.test/v1/product-decisions'),{db,config,sessionSecret:'history-secret',productDecisionLifetimeMs: 300000, productDecisionHistoryLimit:limit,maximumProductInputBytes:32000,productControllerTimeoutMs:15000,maximumProductControllerResponseBytes:1000000, maximumProductControllerTokenCharacters: 64000});return {status,result};};
 for(const [limit,expected] of [[1,['new']],[2,['new','old']]] as const){settings.productDecisionHistoryLimit=limit;fs.writeFileSync(file,JSON.stringify(author));const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings.productDecisionHistoryLimit as number;const response=await read(selected);assert.equal(response.status,200);assert.deepEqual(response.result.decisions.map((r:any)=>r.decision_id),expected);}
 for(const value of [undefined,0,-1,1.5,'2']){settings.productDecisionHistoryLimit=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);assert.equal((await read(value as number)).status,403);}
});


test('central product decision lifetime preserves default and rejects missing or invalid policy', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-lifetime-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'), author=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(author.profiles[selectedControlProfile].settings.productDecisionLifetimeMs,300000);
 for(const value of [120000,undefined,0,-1,1.5,'120000',2147483648]) {
  author.profiles[selectedControlProfile].settings.productDecisionLifetimeMs=value;fs.writeFileSync(file,JSON.stringify(author));
  const capture=()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection);
  if(value===120000) assert.equal(capture().components['prism-control']!.settings.productDecisionLifetimeMs,120000);
  else assert.throws(capture,/SWARM_CONFIG_INVALID/);
 }
});


test('central native attempt lifetime controls original claim and queue deadline without fallback', async t => {
 const priorIdentity=process.env.PRISM_ENGINE_CONTENT_DIGEST;
 process.env.PRISM_ENGINE_CONTENT_DIGEST='sha256:'+'a'.repeat(64);
 let prismNativeAttempt: typeof import('../../../skills/prism/engine/worker-envelope.ts').prismNativeAttempt;
 try { ({prismNativeAttempt}=await import('../../../skills/prism/engine/worker-envelope.ts')); }
 finally { if(priorIdentity===undefined) delete process.env.PRISM_ENGINE_CONTENT_DIGEST;else process.env.PRISM_ENGINE_CONTENT_DIGEST=priorIdentity; }
 const {workerAttemptSpecDigest} = await import('@kubeclaw/worker-core');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attempt-lifetime-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const settings=author.profiles[selectedControlProfile].settings;
 assert.equal(settings.nativeAttemptLifetimeMs,600000);
 assert.equal(settings.nativeAttemptTimeoutMs,300000);
 assert.equal(settings.nativeAttemptCleanupTimeoutMs,10000);
 assert.equal(settings.nativeAttemptLogBytes,1048576);
 const artifact={artifactId:'artifact:sha256:'+'a'.repeat(64),type:'input',mediaType:'application/json',contentDigest:'sha256:'+'a'.repeat(64),sizeBytes:2,storageUrl:'http://prism-control/artifact'};
 for(const lifetime of [1,750,600000]) {
  settings.nativeAttemptLogBytes=lifetime;settings.nativeAttemptCleanupTimeoutMs=lifetime;settings.nativeAttemptTimeoutMs=lifetime;settings.nativeAttemptLifetimeMs=lifetime;fs.writeFileSync(file,JSON.stringify(author));
  const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
  const envelope=prismNativeAttempt('render',artifact,'lifetime',{cpuTimeMs:100,memoryBytes:4096,tasks:2},selected.nativeAttemptLifetimeMs as number, selected.nativeAttemptTimeoutMs as number, selected.nativeAttemptCleanupTimeoutMs as number, selected.nativeAttemptLogBytes as number, 16777216, 134217728, 64);
  assert.equal(Date.parse(envelope.claim.expiresAt)-Date.parse(envelope.issuedAt),lifetime);
  assert.equal(envelope.queueDeadline,envelope.claim.expiresAt);
  assert.equal(envelope.limits.timeoutMs,lifetime);
  assert.equal(envelope.limits.cleanupTimeoutMs,lifetime);
  assert.equal(envelope.limits.logBytes,lifetime);
  const {attemptSpecDigest,...unsigned}=envelope;assert.equal(attemptSpecDigest,workerAttemptSpecDigest(unsigned));
 }
 settings.nativeAttemptLogBytes=1048576;settings.nativeAttemptCleanupTimeoutMs=10000;
 for(const value of [undefined,0,-1,1.5,'750',2147483648]) {
  settings.nativeAttemptLifetimeMs=600000;settings.nativeAttemptTimeoutMs=300000;settings.nativeAttemptCleanupTimeoutMs=value;fs.writeFileSync(file,JSON.stringify(author));
  assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
  assert.throws(()=>prismNativeAttempt('render',artifact,'invalid-cleanup',{cpuTimeMs:100,memoryBytes:4096,tasks:2},600000,300000,value as number, 1048576, 16777216, 134217728, 64),/ATTEMPT_CLEANUP_TIMEOUT_REQUIRED/);
  settings.nativeAttemptCleanupTimeoutMs=10000;settings.nativeAttemptLifetimeMs=value;fs.writeFileSync(file,JSON.stringify(author));
  assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
  settings.nativeAttemptLifetimeMs=600000;settings.nativeAttemptTimeoutMs=value;fs.writeFileSync(file,JSON.stringify(author));
  assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
  assert.throws(()=>prismNativeAttempt('render',artifact,'invalid-timeout',{cpuTimeMs:100,memoryBytes:4096,tasks:2},600000,value as number,10000, 1048576, 16777216, 134217728, 64),/ATTEMPT_TIMEOUT_REQUIRED/);
  assert.throws(()=>prismNativeAttempt('render',artifact,'invalid',{cpuTimeMs:100,memoryBytes:4096,tasks:2},value as number, 300000,10000, 1048576, 16777216, 134217728, 64),/ATTEMPT_LIFETIME_REQUIRED/);
 }
});


test('native attempt log ceiling is required and rejects invalid central authors', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attempt-log-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const value of [undefined,0,-1,1.5,'1024',9007199254740992]) {
  author.profiles[selectedControlProfile].settings.nativeAttemptLogBytes=value;fs.writeFileSync(file,JSON.stringify(author));
  assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
 }
});


test('selected native result and evidence ceilings reach signed envelopes without fallback', async t => {
 const priorIdentity=process.env.PRISM_ENGINE_CONTENT_DIGEST;
 process.env.PRISM_ENGINE_CONTENT_DIGEST='sha256:'+'a'.repeat(64);
 let prismNativeAttempt: typeof import('../../../skills/prism/engine/worker-envelope.ts').prismNativeAttempt;
 try { ({prismNativeAttempt}=await import('../../../skills/prism/engine/worker-envelope.ts')); }
 finally { if(priorIdentity===undefined) delete process.env.PRISM_ENGINE_CONTENT_DIGEST; else process.env.PRISM_ENGINE_CONTENT_DIGEST=priorIdentity; }
 const {workerAttemptSpecDigest}=await import('@kubeclaw/worker-core');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attempt-output-limits-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'),author=JSON.parse(fs.readFileSync(file,'utf8')),settings=author.profiles[selectedControlProfile].settings;
 const artifact={artifactId:'artifact:sha256:'+'a'.repeat(64),type:'input',mediaType:'application/json',contentDigest:'sha256:'+'a'.repeat(64),sizeBytes:2,storageUrl:'http://prism-control/artifact'};
 const keys=['nativeAttemptResultBytes','nativeAttemptEvidenceBytes','nativeAttemptEvidenceFiles'] as const;
 assert.deepEqual(keys.map(k=>settings[k]),[16777216,134217728,64]);
 const make=(limits: readonly number[])=>prismNativeAttempt('render',artifact,'output-limits',{cpuTimeMs:100,memoryBytes:4096,tasks:2},600000,300000,10000,1048576,limits[0]!,limits[1]!,limits[2]!);
 for(const vector of [[16777216,134217728,64],[31,97,3],[1,1,1]]) {
  keys.forEach((k,i)=>settings[k]=vector[i]);fs.writeFileSync(file,JSON.stringify(author));
  const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
  const envelope=make(keys.map(k=>selected[k] as number));
  assert.deepEqual([envelope.limits.resultBytes,envelope.limits.evidenceBytes,envelope.limits.evidenceFiles],vector);
  const {attemptSpecDigest,...unsigned}=envelope;assert.equal(attemptSpecDigest,workerAttemptSpecDigest(unsigned));
  assert.notEqual(attemptSpecDigest,workerAttemptSpecDigest({...unsigned,limits:{...unsigned.limits,evidenceFiles:envelope.limits.evidenceFiles+1}}));
 }
 for(const [i,key] of keys.entries()) for(const value of [undefined,0,-1,1.5,'4',9007199254740992]) {
  keys.forEach((k,j)=>settings[k]=[16777216,134217728,64][j]);settings[key]=value;fs.writeFileSync(file,JSON.stringify(author));
  assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);
  const limits=[16777216,134217728,64];limits[i]=value as number;
  assert.throws(()=>make(limits),/ATTEMPT_(RESULT_BYTES|EVIDENCE_BYTES|EVIDENCE_FILES)_REQUIRED/);
 }
});


test('central corpus search policy controls result slots and family diversity without hidden defaults', async t => {
 const {corpusRoutes}=await import('../../../skills/prism/server/corpus-routes.ts');
 const {search}=await import('../../../skills/prism/corpus/index.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'corpus-policy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json');const author=JSON.parse(fs.readFileSync(file,'utf8'));const policy=author.profiles[selectedControlProfile].settings;
 assert.deepEqual([policy.corpusSearchDefaultLimit,policy.corpusSearchMaximumLimit,policy.corpusSourceFamilyDefaultLimit,policy.corpusSourceFamilyMaximumLimit],[10,50,2,10]);
 Object.assign(policy,{corpusSearchDefaultLimit:3,corpusSearchMaximumLimit:4,corpusSourceFamilyDefaultLimit:1,corpusSourceFamilyMaximumLimit:2});fs.writeFileSync(file,JSON.stringify(author));
 const config=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 const rows=Array.from({length:8},(_,i)=>({id:String(i),source_kind:'internal-project',normalized:{sourceFamily:'family-'+Math.floor(i/2)},ranking:'hybrid-rrf-v1'}));
 const pool={query:async()=>({rows})};
 async function run(query:string){let result:any;await corpusRoutes({config,pool,runWorker:async()=>({embedding:[1],model:'test'})} as any,{method:'GET'} as any,{writeHead(){},end(text:string){result=JSON.parse(text);}} as any,new URL('http://localhost/v1/corpus/search'+query));return result;}
 const defaults=await run('');assert.equal(defaults.items.length,3);assert.ok(defaults.items.every((x:any)=>x.explanation.diversityCap===1));assert.equal(defaults.coverageGap,null);
 const capped=await run('?limit=99&sourceFamilyLimit=99');assert.equal(capped.items.length,4);assert.ok(capped.items.every((x:any)=>x.explanation.diversityCap===2));
 assert.equal((await run('?limit=1&sourceFamilyLimit=1')).items.length,1);
 for(const key of ['corpusSearchDefaultLimit','corpusSearchMaximumLimit','corpusSourceFamilyDefaultLimit','corpusSourceFamilyMaximumLimit']) {const before=policy[key];for(const value of [undefined,0,-1,1.5,'2']){policy[key]=value;fs.writeFileSync(file,JSON.stringify(author));assert.throws(()=>captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection),/SWARM_CONFIG_INVALID/);}policy[key]=before;}
 await assert.rejects(search(pool as any,'q',undefined as any,undefined,{sourceFamilyLimit:1}),/valid corpus search limits/);
 await assert.rejects(search(pool as any,'q',1,undefined,{} as any),/valid corpus search limits/);
});


test('central ingestion deadlines cancel actual HTTP acquisition and cleanup without activation', async t => {
 const {createServer}=await import('node:http');
 const {corpusRoutes}=await import('../../../skills/prism/server/corpus-routes.ts');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ingestion-network-deadlines-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 const file=path.join(dir,'components/prism-control.config.json'),author=JSON.parse(fs.readFileSync(file,'utf8'));
 Object.assign(author.profiles[selectedControlProfile].settings,{ingestionAcquireTimeoutMs:70,ingestionCleanupTimeoutMs:90});fs.writeFileSync(file,JSON.stringify(author));
 const selected=captureSwarmSettings(path.join(dir,'pipeline.config.json'),selection).components['prism-control']!.settings;
 let mode='acquire',workerCalls=0,activations=0;const methods:string[]=[];
 const upstream=createServer((req,res)=>{
  methods.push(req.method!);
  if((mode==='acquire'&&req.method==='POST')||(mode==='cleanup'&&req.method==='DELETE'))return;
  res.writeHead(200,{'content-type':'application/json'});
  res.end(req.method==='DELETE'?'{}':JSON.stringify({normalized:{},quarantineDigest:'sha256:'+'a'.repeat(64),contentBase64:'eA=='}));
 });
 t.after(async()=>{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));});
 await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const address=upstream.address();assert.ok(address&&typeof address==='object');
 const context={config:{...selected,ingestionUrl:new URL(`http://127.0.0.1:${address.port}`),ingestionSecret:'deadline-fixture'},pool:{query:async()=>{activations++;throw Error('unexpected activation');}},runWorker:async()=>{workerCalls++;throw Error('unexpected worker');}} as any;
 const invoke=()=>corpusRoutes(context,Object.assign(request('{}'),{method:'POST'}),{} as any,new URL('http://localhost/v1/corpus'));
 await assert.rejects(invoke(),(error:any)=>error.name==='TimeoutError');
 assert.deepEqual(methods,['POST']);assert.equal(workerCalls,0);assert.equal(activations,0);
 mode='cleanup';
 await assert.rejects(invoke(),(error:any)=>error instanceof AggregateError&&/publication and quarantine cleanup/.test(error.message)&&/digest mismatch/.test(error.errors[0].message)&&error.errors[1].name==='TimeoutError');
 assert.deepEqual(methods,['POST','POST','DELETE']);assert.equal(activations,0);
 mode='healthy';
 await assert.rejects(invoke(),/corpus acquisition digest mismatch/);
 assert.deepEqual(methods,['POST','POST','DELETE','POST','DELETE']);assert.equal(workerCalls,0);assert.equal(activations,0);
});
