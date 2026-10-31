import { studioContentSecurityPolicy } from '../../server/studio-request.ts';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from '../../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
// Actual production App/CSP with controlled API states; not live model/ingress proof.
let server,origin,documents,mutations,polls,complete,failJob,holdPreview,releasePreview,jobDocument;
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
  else if(pathname==='/v1/projects/project/directions')data={items:directions};
  else if(pathname==='/v1/projects/project/brief')data={request:{title:'Comparison'}};
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
test.beforeEach(()=>{jobDocument=0;polls=0;complete=false;failJob=false;holdPreview=false;releasePreview=undefined;mutations=[];documents=names.map((name,index)=>{const d=structuredClone(fixture);d.meta.title=name;d.meta.documentId=`design-${index}`;d.views.home.root.children[0].props.content=`Layout ${index+1}`;return d;});});
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
test('mobile request shows queued/running/applied states and never submits twice',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);await expect(page.getByRole('tab',{name:'Herdfeuer'})).toBeVisible();
 await page.getByRole('button',{name:'Prism',exact:true}).click();await page.locator('.sheet textarea').fill('Make the first third pink');await page.getByRole('button',{name:'Änderung senden',exact:true}).last().click();
 await expect(page.locator('.sheet [role=status]')).toContainText('wartet');await expect(page.locator('.sheet button.primary')).toHaveText('Prism arbeitet…');await expect(page.locator('.sheet button.primary')).toBeDisabled();
 await expect(page.locator('.sheet [role=status]')).toContainText('arbeitet');complete=true;
 await expect(page.locator('.sheet [role=status]')).toContainText('Änderung übernommen');await expect(page.locator('.sheet textarea')).toHaveValue('');
 await expect(page.frameLocator('iframe.plain-preview').getByRole('heading',{name:'Pink revision applied'})).toBeVisible();expect(mutations).toEqual(['/v1/documents/doc-0/engine']);
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
 await page.getByRole('button',{name:'Prism',exact:true}).click();await expect(page.locator('.sheet textarea')).toHaveValue(pending.input.instruction);
 const retry=page.locator('.sheet').getByRole('button',{name:'Status erneut prüfen',exact:true});await expect(retry).toBeEnabled();await retry.click();
 await expect.poll(()=>polls).toBe(2);expect(mutations).toEqual([]);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('prism-agent-revision:'+JSON.stringify(['operator','doc-0']))).idempotencyKey)).toBe('original-key');
});

test('a loading comparison cannot race with submitting a change to the previous document',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/?project=project&document=doc-0`);await expect(page.getByRole('tab',{name:'Herdfeuer'})).toBeVisible();
 holdPreview=true;await page.getByRole('tab',{name:'Wochenwerk'}).click();await expect.poll(()=>typeof releasePreview).toBe('function');
 try{await page.getByRole('button',{name:'Prism',exact:true}).click();await expect(page.locator('.sheet textarea')).toBeDisabled();await expect(page.locator('.sheet button.primary')).toBeDisabled();await expect(page.locator('.sheet button.primary')).toHaveText('Entwurf wird geladen…');}
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
