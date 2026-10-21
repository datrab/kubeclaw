import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
// Optional local reader preview only: exact hashed manifest members, GET/HEAD,
// loopback in the CLI, no tree traversal, directory listing, writes or proxying.
export function createReaderServer(outputRoot){
 outputRoot=path.resolve(outputRoot);assert.equal(fs.realpathSync(outputRoot),outputRoot,'Physical reader root required');
 const manifest=JSON.parse(fs.readFileSync(path.join(outputRoot,'reader-manifest.json'),'utf8'));assert.equal(manifest.schemaVersion,'kubeclaw-reader-artifact.v1');
 const files=new Map();for(const record of manifest.outputs){assert(typeof record.path==='string'&&record.path===path.posix.normalize(record.path)&&!record.path.startsWith('../')&&!path.isAbsolute(record.path)&&!record.path.includes('\\'),'Unsafe manifest path');assert(!files.has('/'+record.path),'Duplicate manifest path');files.set('/'+record.path,record);}
 const read=route=>{const record=files.get(route);assert(record,'Unregistered output');const file=path.join(outputRoot,record.path);assert.equal(fs.realpathSync(file),file,'Redirected artifact member');assert(fs.statSync(file).isFile());const bytes=fs.readFileSync(file);assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256,'Changed artifact member');return bytes;};
 const plan=JSON.parse(read('/'+manifest.redirectManifest));assert.equal(plan.schemaVersion,'kubeclaw-reader-redirects.v1');assert.equal(plan.revision,manifest.revision);assert.deepEqual(plan.entryPoint,{from:'/',to:'/README.html',output:'index.html'});assert(files.has('/README.html')&&files.has('/index.html'),'Missing positive reader home');const redirects=new Map();
 for(const entry of plan.redirects){assert(typeof entry.from==='string'&&entry.from.startsWith('/')&&!entry.from.startsWith('//')&&!/[?#%\\]/u.test(entry.from)&&entry.from===path.posix.normalize(entry.from),'Invalid redirect source');assert(!redirects.has(entry.from));assert(files.has(entry.to)&&entry.to.endsWith('.html'),'Unregistered redirect target');assert(files.has('/'+entry.output),'Missing static redirect');redirects.set(entry.from,entry);read(entry.to);read('/'+entry.output);}
 return http.createServer((request,response)=>{
  const end=(status,text,headers={})=>{response.writeHead(status,{'content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff',...headers});response.end(request.method==='HEAD'?undefined:text);};
  if(!['GET','HEAD'].includes(request.method))return end(405,'GET or HEAD required',{'allow':'GET, HEAD'});
  const raw=(request.url??'').split(/[?#]/u)[0];if(!/^\/[A-Za-z0-9_./-]*$/u.test(raw)||raw.split('/').some(part=>part==='.'||part==='..'))return end(400,'Exact local route required');
  const url=new URL(request.url,'http://reader.invalid');const route=url.pathname;
  if(route==='/')return end(308,'Documentation home',{'location':plan.entryPoint.to+url.search,'cache-control':'no-store'});
  const redirect=redirects.get(route);if(redirect)return end(308,'Documentation page moved',{'location':redirect.to+url.search,'cache-control':'no-store'});
  const target=route==='/'?'/index.html':route.endsWith('/')?route+'index.html':route;
  if(!files.has(target))return end(404,'Not a published reader output');
  try{const bytes=read(target);response.writeHead(200,{'content-type':types[path.extname(target)]??'application/octet-stream','x-content-type-options':'nosniff'});response.end(request.method==='HEAD'?undefined:bytes);}catch{return end(409,'Artifact integrity check failed; rebuild before serving');}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert(process.argv.length>=3&&process.argv.length<=4,'Usage: node scripts/docs-reader/serve.mjs ARTIFACT_ROOT [PORT]');const port=Number(process.argv[3]??4173);assert(Number.isInteger(port)&&port>=0&&port<=65535,'Invalid loopback port');const server=createReaderServer(process.argv[2]);server.listen(port,'127.0.0.1',()=>console.log('Reader preview: http://127.0.0.1:'+server.address().port));
}
