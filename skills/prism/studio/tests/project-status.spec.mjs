import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// Actual production App with explicit API fixtures; not an ingress/authentication proof.
let server, origin, state='needs_nova';let mutations=0;
const id='11111111-1111-4111-8111-111111111111';
const summaries={needs_nova:'Design generation stopped. Nova must reconcile the failed attempt before retrying.',accepted:'Waiting for the Prism agent.',running:'Prism is creating the design.'};
test.use({viewport:{width:390,height:844},hasTouch:true});
test.beforeAll(async()=>{
 const bundle=fileURLToPath(new URL('../../dist-studio/',import.meta.url));
 server=createServer((request,response)=>{void(async()=>{
  const pathname=new URL(request.url,'http://fixture').pathname;
  response.setHeader('content-type','application/json');
  if(pathname==='/v1/session'){response.end(JSON.stringify({csrf:'fixture',userId:'operator'}));return;}
  if(request.method==='POST')mutations++;
  if(pathname==='/v1/projects'){response.end(JSON.stringify({items:[{id,name:'familyclaw-templates-20261030',document_id:null,direction_count:0}]}));return;}
  if(pathname===`/v1/projects/${id}/status`){response.end(JSON.stringify({id,name:'familyclaw-templates-20261030',state,summary:summaries[state],documentId:null}));return;}
  const file=resolve(bundle,`.${pathname==='/'?'/index.html':pathname}`);
  if(!file.startsWith(`${resolve(bundle)}${sep}`)){response.writeHead(404);response.end();return;}
  response.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]??'application/octet-stream');response.end(await readFile(file));
 })().catch(error=>response.destroy(error));});
 server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise(done=>server.close(done));});
for(const status of ['needs_nova','accepted','running'])test(`mobile pending project opens its actual ${status} state without starting a design`,async({page})=>{
 state=status;mutations=0;await page.goto(origin);
 const link=page.getByRole('link',{name:'familyclaw-templates-20261030',exact:true});await expect(link).toBeVisible();
 await link.tap();await expect(page).toHaveURL(new RegExp(`project=${id}`));
 await expect(page.getByRole('status')).toHaveText(summaries[status]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.getByRole('button',{name:'Refresh',exact:true}).tap();await expect(page.getByRole('status')).toHaveText(summaries[status]);
 expect(mutations).toBe(0);
 await page.getByRole('link',{name:'Back to projects'}).tap();await expect(page.getByRole('heading',{name:'Projects from Nova'})).toBeVisible();
});
