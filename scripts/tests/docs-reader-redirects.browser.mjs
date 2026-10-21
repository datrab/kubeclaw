import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {buildReader} from '../docs-reader/renderer.mjs';
import {createReaderServer} from '../docs-reader/serve.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-redirect-browser-owned-'));
const pages=[{relative:'README.md',owner:'documentation',text:'# Home\n'},{relative:'new.md',owner:'owner',text:'# New\n\n## Kept\n'}];
const baseline={schemaVersion:'kubeclaw-published-route-baseline.v1',pages:[{page:'docs/site/old.md',route:'/old/',owner:'old owner'}]};
const registry={schemaVersion:'kubeclaw-documentation-routes.v1',redirects:[{from:'/old/',to:'/new/',reason:'Synthetic controlled test only; not product history.',preservedFragments:['kept']}]};
let browser,server;const observed=[];
try{
 buildReader({outputRoot:root,pages,assets:[],revision:'c'.repeat(40),redirectRegistry:registry,routeBaseline:baseline});
 server=createReaderServer(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const javaScriptEnabled of [false,true]){
  const context=await browser.newContext({javaScriptEnabled});await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'?route.continue():route.abort();});const page=await context.newPage();
  await page.goto(base+'/?q=identity#home');assert.equal(page.url(),base+'/README.html?q=identity#home');assert.equal(await page.locator('#home').count(),1);observed.push({case:'HTTP home bootstrap',javaScriptEnabled,fragment:'home',query:'identity',targetId:true});
  await page.goto(base+'/old/?q=identity#kept');assert.equal(page.url(),base+'/new.html?q=identity#kept');assert.equal(await page.locator('#kept').count(),1);observed.push({case:'HTTP308',javaScriptEnabled,fragment:'kept',query:'identity',targetId:true});
  await page.goto(base+'/old/index.html?q=identity#kept');
  if(javaScriptEnabled){await page.waitForURL('**/new.html?q=identity#kept');assert.equal(await page.locator('#kept').count(),1);observed.push({case:'HTTP static fallback JS',fragment:'kept',query:'identity',targetId:true});}
  else{await page.locator('a[data-reader-redirect]').waitFor({state:'visible',timeout:1000});assert.equal(page.url(),base+'/old/index.html?q=identity#kept');assert((await page.locator('body').innerText()).includes('retain that same fragment'),JSON.stringify({content:await page.content(),text:await page.locator('body').innerText()}));assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'../new.html');assert.equal(await page.locator('a[data-reader-redirect]').getAttribute('href'),'../new.html');await page.locator('a[data-reader-redirect]').click();assert.equal(page.url(),base+'/new.html');await page.goto(page.url()+'#kept');assert.equal(await page.locator('#kept').count(),1);observed.push({case:'HTTP static fallback noJS',automaticForwarding:false,workingVisibleLink:true,manualOriginalFragmentCarry:true});}
  await context.close();
 }
 for(const javaScriptEnabled of [false,true]){
  const context=await browser.newContext({javaScriptEnabled,offline:true});await context.route(/^https?:/u,route=>route.abort());const page=await context.newPage();const old=pathToFileURL(path.join(root,'old/index.html')).href;
  await page.goto(old+'?q=identity#kept');
  if(javaScriptEnabled){await page.waitForURL('**/new.html?q=identity#kept');assert.equal(await page.locator('#kept').count(),1);observed.push({case:'file offline JS',fragment:'kept',query:'identity',targetId:true});}
  else{assert.equal(page.url(),old+'?q=identity#kept');assert(await page.locator('a[data-reader-redirect]').isVisible());await page.locator('a[data-reader-redirect]').click();await page.goto(page.url()+'#kept');assert.equal(await page.locator('#kept').count(),1);observed.push({case:'file offline noJS',automaticForwarding:false,workingVisibleLink:true,manualOriginalFragmentCarry:true});}
  const home=pathToFileURL(path.join(root,'index.html')).href;await page.goto(home+'?q=identity#home');if(javaScriptEnabled){await page.waitForURL('**/README.html?q=identity#home');assert.equal(await page.locator('#home').count(),1);observed.push({case:'file home JS',fragment:'home',targetId:true});}else{assert.equal(page.url(),home+'?q=identity#home');assert(await page.locator('a[data-reader-redirect]').isVisible());await page.locator('a[data-reader-redirect]').click();await page.goto(page.url()+'#home');assert.equal(await page.locator('#home').count(),1);observed.push({case:'file home noJS',workingVisibleLink:true,manualOriginalFragmentCarry:true});}
  await context.close();
 }
 console.log(JSON.stringify({status:'PASS',observations:observed,externalNetwork:'blocked',limit:'No automatic opaque-fragment forwarding without JavaScript; real visible link and explicit manual carry tested.'},null,2));
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
