import {readFileSync} from 'node:fs';
import {page,css,app} from './page.mjs';
const browser=readFileSync(new URL('./browser.mjs',import.meta.url));
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
export async function handleSecretInput(req,res,{broker,publicOrigin}){
 const url=new URL(req.url,publicOrigin);if(!url.pathname.startsWith('/secret-input/'))return false;
 const timer=setTimeout(()=>res.destroy(),20000);timer.unref();res.once('close',()=>clearTimeout(timer));
 function send(status,type,body){res.writeHead(status,{...headers,'Content-Type':type});res.end(body);return true;}
 if(url.search)return send(400,'text/plain','Invalid request');
 const assets=new Map([['/secret-input/',['text/html; charset=utf-8',page]],['/secret-input/style.css',['text/css',css]],['/secret-input/app.mjs',['text/javascript',app]],['/secret-input/browser.mjs',['text/javascript',browser]]]);
 if(req.method==='GET'&&assets.has(url.pathname))return send(200,...assets.get(url.pathname));
 const id=url.pathname.match(/^\/secret-input\/api\/([a-f0-9-]{36})$/)?.[1];
 if(!id||!['GET','POST'].includes(req.method))return send(404,'text/plain','Not found');
 const auth=req.headers.authorization;if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))return send(404,'text/plain','Request unavailable');
 try{
  const token=auth.slice(7);
  if(req.method==='GET')return send(200,'application/json',JSON.stringify(broker.describe(id,token)));
  if(req.headers.origin!==publicOrigin||req.headers['content-type']!=='application/json')return send(403,'text/plain','Request rejected');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)return send(413,'text/plain','Request too large');chunks.push(chunk);}
  const result=await broker.submit(id,token,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  return send(200,'application/json',JSON.stringify(result));
 }catch{return send(409,'text/plain','Request unavailable');}
}
