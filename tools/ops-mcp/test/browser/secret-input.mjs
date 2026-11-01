// Explicit browser acceptance harness; root workspace Playwright is a test-only dependency.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import https from 'node:https';import {once} from 'node:events';import {mkdtempSync,rmSync,readFileSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {generateKeyPairSync} from 'node:crypto';
import {openStore} from '../../src/secret-input/store.mjs';import {createBroker} from '../../src/secret-input/broker.mjs';import {createReceiver} from '../../src/secret-input/receiver.mjs';import {handleSecretInput} from '../../src/secret-input/http.mjs';
const root=mkdtempSync(join(tmpdir(),'secret-browser-'));let browser,server,bs,rs,context;
const output=process.env.SECRET_INPUT_BROWSER_EVIDENCE;let checks=0;
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',join(root,'key'),'-out',join(root,'cert'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
 const pair=generateKeyPairSync('rsa',{modulusLength:3072}),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
 bs=openStore(join(root,'broker.sqlite'));rs=openStore(join(root,'receiver.sqlite'));
 const receiver=createReceiver({store:rs,tenant:'family',namespace:'familyclaw',target:'hetzner-storage',names:['HETZNER_STORAGE_TOKEN'],privateKey:pair.privateKey,publicKey});
 server=https.createServer({key:readFileSync(join(root,'key')),cert:readFileSync(join(root,'cert'))},(req,res)=>{void handleSecretInput(req,res,context).then(handled=>{if(!handled){res.writeHead(404);res.end();}});});server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`https://localhost:${server.address().port}`;
 const broker=createBroker({store:bs,publicOrigin:origin,targets:[{id:'hetzner-storage',tenant:'family',namespace:'familyclaw',clients:['nova'],names:['HETZNER_STORAGE_TOKEN'],publicKey}],deliver:async(_,body)=>receiver.accept(body)});context={broker,publicOrigin:origin};
 // Only the disposable self-signed localhost test certificate is ignored here.
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1280]){
  const requested=broker.create('nova','hetzner-storage','HETZNER_STORAGE_TOKEN');const page=await browser.newPage({viewport:{width,height:900},ignoreHTTPSErrors:true});
  const leaks=[],errors=[],secret='SYNTHETIC-BROWSER-ONLY-CANARY-'+width;
  page.on('request',r=>{if(new URL(r.url()).origin!==origin)leaks.push('external request');if(r.postData()?.includes(secret))leaks.push('plaintext request');});page.on('console',m=>{if(m.text().includes(secret))leaks.push('console');});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(requested.url);await page.locator('form').waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('input').getAttribute('type'),'password');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(output){mkdirSync(output,{recursive:true});await page.screenshot({path:join(output,`input-${width}.png`),fullPage:true});}
  if(width===390){let lost=false;await page.route('**/secret-input/api/*',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});}
  await page.locator('input').fill(secret);await page.getByRole('button',{name:'Verschlüsseln und hinterlegen'}).click();if(width===390){await page.getByText('Die Übergabe ist nicht bestätigt.',{exact:false}).waitFor();assert.equal(await page.locator('input').isDisabled(),true);await page.getByRole('button',{name:'Übergabe erneut prüfen'}).click();checks+=2;}await page.getByText('Sicher hinterlegt.',{exact:false}).waitFor();assert.equal(await page.locator('input').inputValue(),'');assert.equal(broker.status('nova',requested.requestId).state,'stored');
  assert.equal(await receiver.use(broker.status('nova',requested.requestId).reference,p=>p.toString()),secret);assert.deepEqual(leaks,[]);assert.deepEqual(errors,[]);checks+=7;await page.close();
 }
 console.log(JSON.stringify({passed:true,checks,viewports:[390,1280],realProviderAccess:false}));
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));bs?.close();rs?.close();rmSync(root,{recursive:true,force:true});}
