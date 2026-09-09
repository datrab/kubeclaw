import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,unlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pendingRound,savedRound,submitRound,waitForRound,currentDirections,loadRoundDocument,type RoundClient} from '../studio/design-round-client.ts';

test('original round client retains a lost-response request across reload and pending retry over real HTTP',async()=>{
 const temporary=mkdtempSync(join(tmpdir(),'prism-round-client-'));const file=join(temporary,'session.json');
 // Disk-backed session fixture tests persistence; this is not a browser Storage or UI E2E claim.
 const storage={getItem:()=>existsSync(file)?readFileSync(file,'utf8'):null,setItem:(_key:string,value:string)=>writeFileSync(file,value),removeItem:()=>{if(existsSync(file))unlinkSync(file);}};
 const requests:Array<Record<string,unknown>>=[];let drop=true;let ready=false;
 const server=createServer(async(request,response)=>{
  if(request.method==='POST'){
   const chunks=[];for await(const chunk of request)chunks.push(chunk);requests.push(JSON.parse(Buffer.concat(chunks).toString()));
   if(drop){drop=false;response.destroy();return;}
   response.setHeader('content-type','application/json');response.end(JSON.stringify({generationId:'round-fixed'}));return;
  }
  response.setHeader('content-type','application/json');
  if(request.url?.startsWith('/v1/documents/')){response.end(JSON.stringify({document:{meta:{revision:1}}}));return;}
  response.end(JSON.stringify({items:ready?['one','two','three'].map(id=>({id,generation_id:'round-fixed',source_document_id:`doc-${id}`,title:id,summary:id,state:'proposed'})):[]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('test server missing');
 const client:RoundClient={projectId:'project',userId:'user',csrf:'csrf',origin:`http://127.0.0.1:${address.port}`,storage};
 try{
  const pending=pendingRound(client,{documentId:'old-doc',expectedRevision:3,parentRoundId:'old-round'});
  await assert.rejects(submitRound(client,pending));
  const reloaded={...client};assert.equal(savedRound(reloaded)?.idempotencyKey,pending.idempotencyKey);
  const accepted=await submitRound(reloaded,savedRound(reloaded)!);
  assert.equal(await waitForRound(reloaded,accepted,1),null);
  assert.equal(savedRound(reloaded)?.generationId,'round-fixed');
  await submitRound({...client},savedRound(client)!);ready=true;
  const result=await waitForRound(client,savedRound(client)!,1);
  assert.equal(result?.directions.length,3);assert.equal(savedRound(client),null);
  assert.equal(new Set(requests.map(row=>row.idempotencyKey)).size,1);
  assert.ok(requests.every(row=>row.documentId==='old-doc'&&row.expectedRevision===3&&row.parentRoundId==='old-round'));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(temporary,{recursive:true,force:true});}
});


test('original round HTTP calls preserve 400, 500 and text diagnostics and identify broken success contracts',async()=>{
 let status=400;let body='{"error":"parent revision changed","expectedRevision":9}';
 const server=createServer((_request,response)=>{response.statusCode=status;response.end(body);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('test server missing');
 const client:RoundClient={projectId:'project-diagnostics',userId:'user',csrf:'csrf',origin:`http://127.0.0.1:${address.port}`,storage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
 try{
  await assert.rejects(submitRound(client,{documentId:'doc',expectedRevision:1,idempotencyKey:'retained-key'}),error=>error instanceof Error&&error.message.includes('Submit design round for project project-diagnostics: HTTP 400')&&error.message.includes(body));
  status=500;body='{"error":"database unavailable","cause":"connection pool exhausted"}';
  await assert.rejects(currentDirections(client),error=>error instanceof Error&&error.message.includes('Load design directions for project project-diagnostics: HTTP 500')&&error.message.includes(body));
  status=502;body='upstream control reset before document response';
  await assert.rejects(loadRoundDocument(client,[{id:'direction',source_document_id:'document-one',title:'Title',summary:'Summary',state:'proposed'}]),error=>error instanceof Error&&error.message.includes('Load design document document-one: HTTP 502')&&error.message.includes(body));
  status=200;body='not-json-from-control';
  await assert.rejects(currentDirections(client),/HTTP 200.*invalid JSON response.*not-json-from-control/);
  body='{"items":"not-an-array"}';
  await assert.rejects(currentDirections(client),/HTTP 200.*invalid response contract.*items array.*not-an-array/);
  body='{"document":null}';
  await assert.rejects(loadRoundDocument(client,[{id:'direction',source_document_id:'document-one',title:'Title',summary:'Summary',state:'proposed'}]),/HTTP 200.*invalid response contract.*document object/);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
