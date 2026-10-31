import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from '../../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { applyOperation } from '../../domain/index.ts';

// Actual production App + canonical operations. API fixtures do not prove live ingress/model execution.
let server, origin, document, operations, feedback, rejectSave, failFeedback;
function reset() {
  document = structuredClone(fixture);
  document.views.home.root.children.push(...['alpha','beta','gamma'].map(id => ({ id, type:'text', props:{content:id[0].toUpperCase()+id.slice(1)} })));
  operations=[]; feedback=[]; rejectSave=false; failFeedback=false;
}
test.beforeAll(async()=>{
  const bundle=fileURLToPath(new URL('../../dist-studio/',import.meta.url));
  server=createServer((request,response)=>{void(async()=>{
    const pathname=new URL(request.url,'http://fixture').pathname;
    response.setHeader('content-type','application/json');
    const reply=(status,value)=>{response.writeHead(status);response.end(JSON.stringify(value));};
    if(pathname==='/v1/session'){reply(200,{csrf:'fixture',userId:'operator'});return;}
    if(pathname==='/v1/projects/project/brief'){reply(200,{request:{architectureContent:{title:'FamilyClaw',brief:'Architecture boundary '.repeat(300)}}});return;}
    if(pathname==='/v1/projects/project/directions'){reply(200,{items:[{id:'direction',state:'proposed',source_document_id:'demo',title:'Family direction',summary:'Five templates'}]});return;}
    if(pathname==='/v1/documents/demo'){reply(200,{document});return;}
    if(request.method==='POST'&&['/v1/documents/demo/operations','/v1/documents/demo/engine'].includes(pathname)){
      if(request.headers['x-prism-csrf']!=='fixture'){reply(403,{error:'CSRF rejected'});return;}
      const chunks=[];for await(const chunk of request)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString());
      if(pathname.endsWith('/operations')){
        if(rejectSave){reply(409,{error:'Revision conflict'});return;}
        try{document=applyOperation(document,input);operations.push(input);reply(200,document);}catch(error){reply(409,{error:error.message});}return;
      }
      if(input.operation==='evaluate'){reply(200,{specialistResult:{values:{status:'passed',findings:[]}}});return;}
      feedback.push(input);
      if(failFeedback){failFeedback=false;reply(503,{error:'Feedback connection interrupted'});return;}
      document=applyOperation(document,{type:'node.props.set',baseRevision:input.baseRevision,nodeId:'title',props:{content:'Reviewed layout'}});
      reply(200,{jobId:'revision-job'});return;
    }
    if(pathname==='/v1/agent-jobs/revision-job'){reply(200,{status:'completed',result:document});return;}
    const file=resolve(bundle,`.${pathname==='/'?'/index.html':pathname}`);
    if(!file.startsWith(`${resolve(bundle)}${sep}`)){reply(404,{});return;}
    response.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]??'application/octet-stream');response.end(await readFile(file));
  })().catch(error=>response.destroy(error));});
  server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise(done=>server.close(done));});
test.beforeEach(reset);

for(const mobile of [false,true])test.describe(mobile?'touch phone':'desktop mouse',()=>{
  test.use({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile});
  async function editor(page){
    if(mobile)await page.getByRole('button',{name:'Edit elements',exact:true}).tap();
    const scope=page.locator(mobile?'.sheet':'.inspector').getByRole('region',{name:'Element editor'});
    await expect(scope).toBeVisible();return scope;
  }
  async function gesture(page,scope,cancel=false){
    const handle=scope.getByRole('button',{name:'Move text: Beta',exact:true});
    const target=scope.locator('[data-element-id="alpha"]');
    await handle.scrollIntoViewIfNeeded();
    const start=await handle.boundingBox(),end=await target.boundingBox();expect(start).not.toBeNull();expect(end).not.toBeNull();
    const from={x:start.x+start.width/2,y:start.y+start.height/2},to={x:end.x+end.width/2,y:end.y+end.height/2};
    if(mobile){
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
    }else{
      await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
    }
  }
  test('project brief stays secondary and viewport controls resize both editing and preview canvases',async({page})=>{
    const alltag=structuredClone(document.views.home);
    const focus=structuredClone(alltag);focus.title='Tagesfokus';focus.root.children[0].props.content='Fokusansicht';
    document.views={alltag,tagesfokus:focus};
    await page.goto(`${origin}/?project=project&document=demo`);
    await expect(page.frameLocator('.design-canvas iframe').getByRole('heading',{name:'Deployments',exact:true})).toBeVisible();
    await expect(page.locator('.brief')).toBeVisible();
    expect(await page.locator('.brief').evaluate(el=>el.open)).toBe(false);
    await expect(page.locator('.design-canvas')).toBeInViewport();
    if(mobile)await page.getByRole('button',{name:'Navigate',exact:true}).tap();
    await page.locator(mobile?'.sheet':'.navigator').getByRole('button',{name:mobile?'Tagesfokus':'Tagesfokus 1 states',exact:true}).click();
    await expect(page.frameLocator('.design-canvas iframe').getByRole('heading',{name:'Fokusansicht',exact:true})).toBeVisible();
    for(const mode of ['edit','preview']){
      if(mode==='preview')await page.getByRole('button',{name:'Preview',exact:true}).click();
      for(const [value,width] of [['compact',390],['regular',768],['wide',1280]]){
        await page.getByLabel('Viewport',{exact:true}).selectOption(value);
        await expect(page.locator('.device')).toHaveCSS('width',`${width}px`);
        if(mode==='edit')await expect(page.locator('.design-canvas iframe')).toHaveCSS('width',`${width}px`);
        if(mode==='preview')await expect(page.locator('iframe[title="Isolated prototype preview"]')).toHaveCSS('width',`${width}px`);
      }
    }
    await page.getByRole('button',{name:'Check design',exact:true}).click();
    await expect(page.locator('.workspace').getByRole('region',{name:'Design quality'})).toBeVisible();
    await expect(page.locator('.plain-preview')).toBeInViewport();
    await page.locator('.brief summary').click();await expect(page.locator('.brief dd').first()).toBeVisible();
    await page.locator('.brief summary').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  });
  test('arbitrary text and sibling order persist through real operations and page reload',async({page},testInfo)=>{
    await page.goto(`${origin}/?document=demo`);
    const tools=page.locator('.layout-tools');await tools.locator('summary').click();
    await expect(tools.getByTestId('drawer-item:Heading')).toBeVisible();await expect(tools.getByRole('textbox',{name:'title',exact:true})).toHaveCount(0);
    await tools.locator('summary').click();let scope=await editor(page);
    await scope.getByRole('button',{name:'text: Alpha',exact:true}).click();
    await scope.getByLabel('Element text').fill('Family notes — edited');await scope.getByRole('button',{name:'Save text',exact:true}).click();
    await expect(scope.getByRole('status')).toHaveText('Saved to this design.');
    await scope.getByRole('button',{name:'Move down',exact:true}).click();
    await expect.poll(()=>operations.length).toBe(2);
    expect(document.views.home.root.children.map(node=>node.id)).toEqual(['title','beta','alpha','gamma']);
    expect(operations.map(operation=>operation.baseRevision)).toEqual([1,2]);
    await page.reload();scope=await editor(page);
    await scope.getByRole('button',{name:'text: Family notes — edited',exact:true}).click();await expect(scope.getByLabel('Element text')).toHaveValue('Family notes — edited');
    expect(await scope.locator('[data-element-id]').evaluateAll(rows=>rows.map(row=>row.dataset.elementId))).toEqual(['home-root','title','beta','alpha','gamma']);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('editor.png')});
  });
  test('a real pointer drag saves one canonical reorder',async({page})=>{
    await page.goto(`${origin}/?document=demo`);const scope=await editor(page);await gesture(page,scope);
    await expect.poll(()=>operations.length).toBe(1);
    expect(operations[0]).toMatchObject({type:'node.move',nodeId:'beta',index:1,baseRevision:1});
    expect(document.views.home.root.children.map(node=>node.id)).toEqual(['title','beta','alpha','gamma']);
  });
  test('selecting an element in the rendered design exposes its actual text and updates the live preview',async({page})=>{
    await page.goto(`${origin}/?document=demo`);let scope=await editor(page);
    await scope.getByRole('button',{name:'text: Alpha',exact:true}).click();
    if(mobile)await page.getByRole('button',{name:'Close',exact:true}).tap();
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    const frame=page.frameLocator('iframe[title="Isolated prototype preview"]');
    await frame.getByRole('heading',{name:'Deployments',exact:true}).click();
    if(mobile)scope=await editor(page);
    await expect(scope.getByLabel('Element text')).toHaveValue('Deployments');
    await scope.getByLabel('Element text').fill('Familienboard');await scope.getByRole('button',{name:'Save text',exact:true}).click();
    await expect(scope.getByRole('status')).toHaveText('Saved to this design.');
    if(mobile)await page.getByRole('button',{name:'Close',exact:true}).tap();
    await expect(frame.getByRole('heading',{name:'Familienboard',exact:true})).toBeVisible();expect(document.views.home.root.children[0].props.content).toBe('Familienboard');
  });
  test('a rejected save keeps the editor and draft visible without claiming success',async({page})=>{
    rejectSave=true;await page.goto(`${origin}/?document=demo`);const scope=await editor(page);
    await scope.getByLabel('Element text').fill('Unsaved draft');await scope.getByRole('button',{name:'Save text',exact:true}).click();
    await expect(scope.getByRole('alert')).toContainText('Revision conflict');await expect(scope.getByLabel('Element text')).toHaveValue('Unsaved draft');
    await expect(scope.getByRole('status')).toHaveCount(0);expect(document.meta.revision).toBe(1);await expect(page.getByRole('heading',{name:'Prism cannot open'})).toHaveCount(0);
  });
  test('interrupted feedback stays editable/reconcilable after reload and reuses its original identity',async({page})=>{
    failFeedback=true;await page.goto(`${origin}/?document=demo`);if(mobile)await page.locator('.mobile-nav').getByRole('button',{name:'Prism',exact:true}).tap();
    let scope=page.locator(mobile?'.sheet':'.inspector');await scope.getByLabel('Prism instruction').fill('More space around the family notes');await scope.getByRole('button',{name:'Propose change',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Prism cannot open'})).toHaveCount(0);
    await expect(scope.getByRole('button',{name:'Reconcile existing change',exact:true})).toBeEnabled();
    await page.reload();if(mobile)await page.locator('.mobile-nav').getByRole('button',{name:'Prism',exact:true}).tap();scope=page.locator(mobile?'.sheet':'.inspector');
    await expect(scope.getByLabel('Prism instruction')).toHaveValue('More space around the family notes');await expect(scope.getByLabel('Prism instruction')).toBeDisabled();
    await scope.getByRole('button',{name:'Reconcile existing change',exact:true}).click();
    await expect(scope.getByRole('button',{name:'Propose change',exact:true})).toBeVisible({timeout:5000});
    await expect(scope.getByLabel('Prism instruction')).toBeEnabled();
    expect(feedback).toHaveLength(2);expect(feedback[0].idempotencyKey).toBe(feedback[1].idempotencyKey);expect(feedback[1].input.instruction).toBe('More space around the family notes');
    expect(document.views.home.root.children[0].props.content).toBe('Reviewed layout');
  });
  if(mobile)test('touch cancellation never saves a half-finished move',async({page})=>{
    await page.goto(`${origin}/?document=demo`);const scope=await editor(page);await gesture(page,scope,true);
    await expect(scope.locator('[data-drop-target]')).toHaveCount(0);expect(operations).toHaveLength(0);expect(document.meta.revision).toBe(1);
  });
});
