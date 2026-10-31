import { studioContentSecurityPolicy } from '../../server/studio-request.ts';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from '../../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
// Actual production App/CSP with controlled API states; not live model/ingress proof.
let activeDirections,server,origin,documents,mutations,polls,complete,failJob,holdPreview,releasePreview,jobDocument,chatTurns,holdChatHistory,releaseChatHistory,preferenceBodies,renameChatView;
const names=['Herdfeuer','Wochenwerk','Nachtlotse'];
const directions=names.map((title,index)=>({id:`direction-${index}`,title,summary:`Different layout ${index+1}`,state:'proposed',source_document_id:`doc-${index}`}));
const pending={operation:'generate',baseRevision:1,input:{instruction:'Make the first third pink',mode:'refine'},idempotencyKey:'original-key',jobId:'same-job'};
test.beforeAll(async()=>{
 const bundle=fileURLToPath(new URL('../../dist-studio/',import.meta.url));
 server=createServer((request,response)=>{void(async()=>{
  response.setHeader('content-security-policy',studioContentSecurityPolicy);
  const pathname=new URL(request.url,'http://fixture').pathname;
  if(request.method==='POST' && pathname!=='/v1/session')mutations.push(pathname);
  let data;
  if(pathname==='/v1/session')data={csrf:'fixture',userId:'operator'};
  else if(pathname==='/v1/projects/project/directions')data={items:activeDirections};
  else if(pathname==='/v1/projects/project/brief')data={request:{title:'Comparison'}};
  else if(pathname.endsWith('/chat')){
   if(request.method==='POST'){const chunks=[];for await(const chunk of request)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString());chatTurns.push({job_id:'chat-job',message:input.message,reply:null,state:'running',created_at:'2026-10-31T20:00:00Z'});data={jobId:'chat-job'};}
   else {if(holdChatHistory){const snapshot=structuredClone(chatTurns);await new Promise(resolve=>{releaseChatHistory=resolve;});data={items:snapshot};}else {if(complete&&chatTurns.length){chatTurns[0].state='completed';chatTurns[0].reply='Ich habe den oberen Bereich pink gestaltet.';documents[0].meta.revision=2;(documents[0].views.home??documents[0].views.alltag).root.children[0].props.content='Pink revision applied';if(renameChatView&&documents[0].views.home){documents[0].views.alltag=documents[0].views.home;delete documents[0].views.home;}}data={items:chatTurns};}}
  }
  else if(pathname==='/v1/preferences'){const chunks=[];for await(const chunk of request)chunks.push(chunk);preferenceBodies.push(JSON.parse(Buffer.concat(chunks).toString()));data={status:'recorded'};}
  else if(pathname.endsWith('/select')){const chunks=[];for await(const chunk of request)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString());const index=Number(pathname.split('/')[3].split('-').at(-1));data={documentId:input.documentId,document:documents[index]};}
  else if(pathname.startsWith('/v1/documents/') && !pathname.endsWith('/engine')){if(holdPreview && pathname==='/v1/documents/doc-1')await new Promise(resolve=>{releasePreview=resolve;});data={document:documents[Number(pathname.split('-').at(-1))]};}
  else if(pathname.endsWith('/engine'))data={jobId:'same-job'};
  else if(pathname==='/v1/agent-jobs/same-job'){
   polls++;if(failJob){response.writeHead(422,{'content-type':'application/json'});response.end(JSON.stringify({error:'NeedsNova: external outcome needs review'}));return;}const next=structuredClone(documents[jobDocument]);next.meta.revision=2;next.views.home.root.children[0].props.content='Pink revision applied';
   data={status:complete?'completed':polls===1?'accepted':'running',result:complete?next:null};
  }
  if(data){response.setHeader('content-type','application/json');response.end(JSON.stringify(data));return;}
  const file=resolve(bundle,`.${pathname==='/'?'/index.html':pathname}`);if(!file.startsWith(resolve(bundle)+sep)){response.writeHead(404);response.end();return;}
  response.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]??'application/octet-stream');response.end(await readFile(file));
 })().catch(error=>response.destroy(error));});
 server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(()=>{activeDirections=directions;renameChatView=false;holdChatHistory=false;releaseChatHistory=undefined;preferenceBodies=[];chatTurns=[];jobDocument=0;polls=0;complete=false;failJob=false;holdPreview=false;releasePreview=undefined;mutations=[];documents=names.map((name,index)=>{const d=structuredClone(fixture);d.meta.title=name;d.meta.documentId=`design-${index}`;d.views.home.root.children[0].props.content=`Layout ${index+1}`;return d;});});
test.afterAll(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
for(const width of [390,1440])test(`all three actual layouts are reachable without selecting one at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);
 for(let i=0;i<3;i++){
  await page.getByRole('tab',{name:names[i]}).click();
  await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:`Layout ${i+1}`})).toBeVisible();
  await expect(page.getByRole('tab',{name:names[i]})).toHaveAttribute('aria-selected','true');
 }
 if(width===390){await page.getByRole('button',{name:'Entwürfe (3)',exact:true}).click();await page.locator('.direction-options button').first().click();await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Layout 1'})).toBeVisible();}
 expect(mutations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
});
test('mobile chat returns the reply and updates a renamed view without implicit preferences',async({page})=>{
 renameChatView=true;
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);
 await page.getByRole('button',{name:'Prism',exact:true}).click();const chat=page.locator('.sheet .studio-chat');await chat.getByLabel('Nachricht an Prism').fill('Make the first third pink');await chat.getByRole('button',{name:'Nachricht senden',exact:true}).click();
 await expect(chat.getByRole('log')).toContainText('Make the first third pink');complete=true;
 await expect(chat.getByRole('log')).toContainText('Ich habe den oberen Bereich pink gestaltet.',{timeout:15000});
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Pink revision applied'})).toBeVisible();expect(mutations).toEqual(['/v1/documents/doc-0/chat']);
 await chat.getByRole('button',{name:'Als Vorliebe speichern',exact:true}).click();await expect(chat).toContainText('Als Vorliebe für dieses Projekt gespeichert.');
 expect(preferenceBodies).toHaveLength(1);expect(preferenceBodies[0].source).toBe('explicit');expect(preferenceBodies[0].occurredAt).toBe('2026-10-31T20:00:00.000Z');
});
test('Nachtlotse can be explicitly confirmed on a phone without approving publication',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);await page.getByRole('tab',{name:'Nachtlotse'}).click();
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Layout 3'})).toBeVisible();
 await page.getByRole('button',{name:'Diesen Entwurf bestätigen',exact:true}).click();
 await expect(page.getByRole('button',{name:'✓ Entwurf bestätigt',exact:true})).toBeDisabled();await expect(page.locator('.approval-status')).toContainText('Vorliebe für dieses Projekt');
 expect(mutations).toEqual(['/v1/directions/direction-2/select']);
});
test('reload resumes a saved completed job automatically without POST or losing the instruction',async({page})=>{
 complete=true;await page.addInitScript(value=>sessionStorage.setItem('prism-agent-revision:'+JSON.stringify(['operator','doc-0']),JSON.stringify(value)),pending);
 await page.goto(`${origin}/?project=project&document=doc-0`);await expect(page.locator('.workspace [role=status]')).toContainText('Änderung übernommen');
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Pink revision applied'})).toBeVisible();expect(mutations).toEqual([]);expect(polls).toBe(1);
 expect(await page.evaluate(()=>sessionStorage.getItem('prism-agent-revision:'+JSON.stringify(['operator','doc-0'])))).toBeNull();
});

test('unresolved saved change shows a clear retry state and preserves its identity/text',async({page})=>{
 failJob=true;await page.setViewportSize({width:390,height:844});await page.addInitScript(value=>sessionStorage.setItem('prism-agent-revision:'+JSON.stringify(['operator','doc-0']),JSON.stringify(value)),pending);
 await page.goto(`${origin}/?project=project&document=doc-0`);await expect(page.locator('.workspace [role=status]')).toContainText('Dein Text bleibt gespeichert');
 await page.getByRole('button',{name:'Prism',exact:true}).click();await expect(page.locator('.sheet')).toContainText(pending.input.instruction);
 const retry=page.locator('.sheet').getByRole('button',{name:'Status der bisherigen Änderung prüfen',exact:true});await expect(retry).toBeEnabled();await retry.click();
 await expect.poll(()=>polls).toBe(2);expect(mutations).toEqual([]);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('prism-agent-revision:'+JSON.stringify(['operator','doc-0']))).idempotencyKey)).toBe('original-key');
});

test('a loading comparison cannot race with submitting a change to the previous document',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);await expect(page.getByRole('tab',{name:'Herdfeuer'})).toBeVisible();
 holdPreview=true;await page.getByRole('tab',{name:'Wochenwerk'}).click();await expect.poll(()=>typeof releasePreview).toBe('function');
 try{await page.getByRole('button',{name:'Prism',exact:true}).click();await expect(page.locator('.sheet textarea')).toBeDisabled();await expect(page.locator('.sheet button.primary')).toBeDisabled();await expect(page.locator('.sheet button.primary')).toHaveText('Nachricht senden');}
 finally{holdPreview=false;releasePreview();}
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Layout 2'})).toBeVisible();expect(mutations).toEqual([]);
});

test('switching to a document restores and resumes its saved job without resubmission',async({page})=>{
 complete=true;jobDocument=1;
 await page.addInitScript(value=>sessionStorage.setItem('prism-agent-revision:'+JSON.stringify(['operator','doc-1']),JSON.stringify(value)),pending);
 await page.goto(`${origin}/?project=project&document=doc-0`);
 await page.getByRole('tab',{name:'Wochenwerk'}).click();
 await expect(page.locator('.workspace [role=status]')).toContainText('Änderung übernommen');
 await expect(page).toHaveURL(/document=doc-1/);
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Pink revision applied'})).toBeVisible();
 expect(mutations).toEqual([]);expect(polls).toBe(1);
 expect(await page.evaluate(()=>sessionStorage.getItem('prism-agent-revision:'+JSON.stringify(['operator','doc-1'])))).toBeNull();
});

test('a history response started before POST cannot erase an acknowledged running turn',async({page})=>{
 holdChatHistory=true;await page.setViewportSize({width:1440,height:1000});await page.goto(`${origin}/?project=project&document=doc-0`);
 await expect.poll(()=>typeof releaseChatHistory).toBe('function');const chat=page.locator('.inspector .studio-chat');
 await chat.getByLabel('Nachricht an Prism').fill('Discuss the typography');await chat.getByRole('button',{name:'Nachricht senden',exact:true}).click();
 await expect(chat.getByRole('log')).toContainText('Discuss the typography');holdChatHistory=false;releaseChatHistory();
 await expect(chat.getByRole('log')).toContainText('Discuss the typography');await chat.getByLabel('Nachricht an Prism').fill('Another message');
 await expect(chat.getByRole('button',{name:'Nachricht senden',exact:true})).toBeDisabled();expect(mutations).toEqual(['/v1/documents/doc-0/chat']);
});

test('phone chat waits for real variants and automatically displays the completed successor set',async({page})=>{
 chatTurns=[{job_id:'variant-chat',message:'Mach drei luftigere Vorschläge',reply:'Drei neue Entwürfe werden erstellt.',state:'completed',design_job_id:'variant-round',design_state:'running',created_at:'2026-10-31T20:00:00Z'}];
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);
 await page.getByRole('button',{name:'Prism',exact:true}).click();const chat=page.locator('.sheet .studio-chat');
 await expect(chat).toContainText('Drei neue Entwürfe werden erstellt…');
 await expect(chat.getByRole('button',{name:'Nachricht senden',exact:true})).toBeDisabled();
 await expect(page.getByRole('tab',{name:'Herdfeuer'})).toBeVisible();
 activeDirections=['Offener Nachtlotse','Ruhiges Editorial','Leichte Übersicht'].map((title,index)=>{const d=structuredClone(documents[index]);d.meta.title=title;d.views.home.root.children[0].props.content=title;documents.push(d);return {id:`new-${index}`,title:`Nachtlotse · ${title}`,state:'proposed',source_document_id:`doc-${index+3}`};});
 chatTurns[0].design_state='completed';
 await expect(page.getByRole('tab',{name:'Offener Nachtlotse'})).toHaveAttribute('aria-selected','true',{timeout:15000});
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Offener Nachtlotse'})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Ruhiges Editorial'})).toBeVisible();await expect(page.getByRole('tab',{name:'Leichte Übersicht'})).toBeVisible();await expect(page.locator('.design-decision')).toContainText('Offener Nachtlotse');
 expect(mutations).toEqual([]);
});

test('an unresolved turn cannot accumulate another submitted request in its blocked session',async({page})=>{
 chatTurns=[{job_id:'unresolved',message:'Already sent',reply:null,state:'needs_nova',created_at:'2026-10-31T20:00:00Z'}];
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);await page.getByRole('button',{name:'Prism',exact:true}).click();const chat=page.locator('.sheet .studio-chat');
 await expect(chat).toContainText('blockiert weitere Nachrichten dieser Session');await chat.getByLabel('Nachricht an Prism').fill('Do not duplicate this request');await expect(chat.getByRole('button',{name:'Nachricht senden',exact:true})).toBeDisabled();expect(mutations).toEqual([]);
});
