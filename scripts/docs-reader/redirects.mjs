import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parse} from 'parse5';
import {assertRouteContinuity} from '../lib/docs-route-continuity.mjs';

const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function pinnedReaderRouteBaseline(root){const bytes=fs.readFileSync(path.join(root,'scripts/docs-published-route-baseline.json'));assert.equal(digest(bytes),'c9fd21962ade0616a71cc5f0a30363b0020ed26028fd88444a9934197d76f6b7','Known route baseline changed; do not renew it to conceal removal');return JSON.parse(bytes);}
export const legacyReaderRoute=relative=>relative==='README.md'?'/':relative.endsWith('/README.md')?'/'+relative.slice(0,-9):'/'+relative.slice(0,-3)+'/';
function localRoute(route){
 assert(typeof route==='string'&&/^\/(?:[A-Za-z0-9_.-]+\/)*(?:[A-Za-z0-9_.-]+\.html)?$/u.test(route),'Redirect route must be an exact local directory or HTML route');
 assert(route===path.posix.normalize(route)&&!route.split('/').some(part=>part==='.'||part==='..'),'Noncanonical redirect route');return route;
}
function outputFor(route){return route.endsWith('/')?route.slice(1)+'index.html':route.slice(1);}
function ids(html){const found=new Set();function visit(n){const a=Object.fromEntries((n.attrs??[]).map(x=>[x.name,x.value]));if(a.id)found.add(a.id);if(n.tagName==='a'&&a.name)found.add(a.name);for(const child of n.childNodes??[])visit(child);}visit(parse(html));return found;}

// Explicit pages come from publicationPages, never an extension scan. Baseline
// is the existing pinned known-route authority, not evidence of deployed URLs.
export function compileReaderRedirects({outputRoot,pages,registry,baseline}){
 assert.equal(registry.schemaVersion,'kubeclaw-documentation-routes.v1');assert(Array.isArray(registry.redirects));
 const canonical=new Map(),current=[];
 for(const page of pages){
  assert(typeof page.relative==='string'&&/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md$/u.test(page.relative),'Invalid positive page');assert(page.relative===path.posix.normalize(page.relative)&&!page.relative.startsWith('../'),'Noncanonical positive page');
  const html='/'+page.relative.slice(0,-3)+'.html',friendly=legacyReaderRoute(page.relative);
  assert(!canonical.has(html)&&!canonical.has(friendly),'Duplicate canonical reader route');
  const target={html,ids:ids(fs.readFileSync(path.join(outputRoot,html.slice(1)),'utf8'))};canonical.set(html,target);canonical.set(friendly,target);
  assert(typeof page.owner==='string'&&page.owner.trim(),'Positive page needs its actual owner');current.push({page:'docs/site/'+page.relative,route:friendly,owner:page.owner});
 }
 // Existing continuity rejects erased known routes, dead targets, chains and
 // loops in the governance route vocabulary before files are emitted.
 assert(canonical.has('/README.html'),'Positive reader home is required for the existing index bootstrap');
 assertRouteContinuity(baseline,current,registry);
 const redirects=[],sources=new Set(),outputPaths=new Set();
 for(const entry of registry.redirects){
  localRoute(entry.from);localRoute(entry.to);assert(!canonical.has(entry.from),'Redirect source is canonical');
  assert(!sources.has(entry.from),'Duplicate redirect');sources.add(entry.from);
  const target=canonical.get(entry.to);assert(target,'Redirect target must be a selected canonical page');
  assert(typeof entry.reason==='string'&&entry.reason.trim(),'Redirect needs reason');
  assert(Array.isArray(entry.preservedFragments),'Redirect must declare reviewed preservedFragments, including an explicit empty list');
  assert(new Set(entry.preservedFragments).size===entry.preservedFragments.length,'Duplicate retained fragment');
  for(const fragment of entry.preservedFragments)assert(typeof fragment==='string'&&fragment&&target.ids.has(fragment),'Redirect would lose a declared original fragment: '+fragment);
  const output=outputFor(entry.from);assert(!outputPaths.has(output),'Duplicate static redirect output');outputPaths.add(output);assert(!fs.existsSync(path.join(outputRoot,output)),'Redirect output collides with existing publication');
  redirects.push({from:entry.from,to:target.html,output,canonicalUrl:target.html,reason:entry.reason,preservedFragments:[...entry.preservedFragments].sort()});
 }
 return {schemaVersion:'kubeclaw-reader-redirects.v1',entryPoint:{from:'/',to:'/README.html',output:'index.html'},redirects:redirects.sort((a,b)=>a.from.localeCompare(b.from)),staticNoJavaScriptLimit:'No automatic static redirect without JavaScript: native meta refresh drops an incoming opaque fragment. Follow the canonical link and retain any original fragment manually.'};
}

export const redirectClient="'use strict';const link=document.querySelector('a[data-reader-redirect]');if(link){const target=new URL(link.getAttribute('href'),location.href);target.search=location.search;target.hash=location.hash;location.replace(target.href);}\n";

// Called after the existing renderer. Emitted outputs join its same byte-hash
// manifest. No redirect page becomes a canonical/search/navigation page.
export function appendReaderRedirects({outputRoot,manifest,pages,registry,baseline,assets=[]}){
 const plan=compileReaderRedirects({outputRoot,pages,registry,baseline});
 const outputs=manifest.outputs.filter(record=>record.path!=='reader-manifest.json');const used=new Set([...outputs.map(x=>x.path),'reader-manifest.json']);
 // Bind only the caller's already selected copied assets, never a directory scan.
 for(const name of assets){
  assert(typeof name==='string'&&name===path.posix.normalize(name)&&!name.startsWith('../')&&!path.isAbsolute(name)&&!name.includes('\\'),'Unsafe selected asset path');
  assert(!used.has(name),'Selected asset output collision: '+name);
  const file=path.join(outputRoot,name);assert.equal(fs.realpathSync(file),file,'Selected asset must be physical');assert(fs.statSync(file).isFile(),'Selected asset must be a regular file');
  const bytes=fs.readFileSync(file);used.add(name);outputs.push({path:name,bytes:bytes.length,sha256:digest(bytes)});
 }
 function write(name,bytes){assert(!used.has(name),'Redirect output collision: '+name);used.add(name);fs.mkdirSync(path.dirname(path.join(outputRoot,name)),{recursive:true});fs.writeFileSync(path.join(outputRoot,name),bytes);outputs.push({path:name,bytes:Buffer.byteLength(bytes),sha256:digest(bytes)});}
 write('reader-redirect.js',redirectClient);
 for(const entry of plan.redirects){const directory=path.posix.dirname(entry.output),href=path.posix.relative(directory,entry.to.slice(1)),script=path.posix.relative(directory,'reader-redirect.js'),stylesheet=path.posix.relative(directory,'reader.css');
  write(entry.output,readerRedirectPage({href,script,stylesheet,reason:entry.reason}));
 }
 write('redirect-manifest.json',JSON.stringify({...plan,revision:manifest.revision},null,2)+'\n');
 const next={...manifest,redirectManifest:'redirect-manifest.json',outputs:outputs.sort((a,b)=>a.path.localeCompare(b.path))};fs.writeFileSync(path.join(outputRoot,'reader-manifest.json'),JSON.stringify(next,null,2)+'\n');return next;
}

export function readerRedirectPage({href,script,stylesheet,reason}) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Documentation page moved</title><link rel="stylesheet" href="${escape(stylesheet)}"><link rel="canonical" href="${escape(href)}"><script src="${escape(script)}" defer></script></head><body><h1>Documentation page moved</h1><p>${escape(reason)}</p><p><a data-reader-redirect href="${escape(href)}">Open the canonical page</a></p><noscript><p>Automatic forwarding requires JavaScript. Follow the canonical link. If the original address ends in #fragment, retain that same fragment on the destination address. This page does not silently discard it.</p></noscript></body></html>\n`; }
