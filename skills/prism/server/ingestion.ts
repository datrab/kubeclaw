import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash, timingSafeEqual } from "node:crypto";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateSource, type CorpusInput } from "../corpus/index.ts";

const secret=process.env.PRISM_INGESTION_SECRET??"";
if(!secret)throw new Error("PRISM_INGESTION_SECRET is required");
const root=process.env.PRISM_QUARANTINE_ROOT??"/quarantine";
await mkdir(root,{recursive:true});
const quarantineTtl=Math.min(86_400_000,Math.max(60_000,Number(process.env.PRISM_QUARANTINE_TTL_MS??3_600_000)));
async function reapQuarantine():Promise<void>{
  const now=Date.now();for(const name of await readdir(root)){if(!/^[a-f0-9]{64}$/u.test(name))continue;const path=join(root,name);const info=await stat(path).catch(()=>undefined);if(info&&now-info.mtimeMs>=quarantineTtl)await unlink(path).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});}
}
await reapQuarantine();setInterval(()=>{void reapQuarantine().catch((error)=>console.error("Prism quarantine cleanup failed",error));},Math.min(quarantineTtl,60_000)).unref();

const blockedV4=(address:string)=>{const p=address.split(".").map(Number);return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31)||p[0]>=224;};
const blocked=(address:string)=>{
  if(isIP(address)===4)return blockedV4(address);
  const v=address.toLowerCase();
  const dotted=v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u);
  if(dotted)return blockedV4(dotted[1]!);
  const mapped=v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if(mapped){const high=Number.parseInt(mapped[1]!,16),low=Number.parseInt(mapped[2]!,16);return blockedV4(`${high>>8}.${high&255}.${low>>8}.${low&255}`);}
  const compatibleDotted=v.match(/^::(\d+\.\d+\.\d+\.\d+)$/u);
  if(compatibleDotted)return blockedV4(compatibleDotted[1]!);
  const compatibleHex=v.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if(compatibleHex){const high=Number.parseInt(compatibleHex[1]!,16),low=Number.parseInt(compatibleHex[2]!,16);return blockedV4(`${high>>8}.${high&255}.${low>>8}.${low&255}`);}
  return v==="::"||v==="::1"||v.startsWith("fc")||v.startsWith("fd")||/^fe[89ab]/u.test(v)||v.startsWith("ff");
};
async function getPinned(url:URL,address:string,family:number):Promise<{status:number;headers:Record<string,string|string[]|undefined>;bytes:Buffer}>{
  return new Promise((resolve,reject)=>{
    const request=httpsRequest({protocol:"https:",hostname:address,family,servername:url.hostname,port:url.port||443,path:`${url.pathname}${url.search}`,method:"GET",headers:{host:url.host,"user-agent":"KubeClaw-Prism/1.0"},rejectUnauthorized:true},(response)=>{
      const chunks:Buffer[]=[];let size=0;
      response.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>6_000_000){request.destroy(new Error("source is too large"));return;}chunks.push(chunk);});
      response.on("end",()=>resolve({status:response.statusCode??0,headers:response.headers,bytes:Buffer.concat(chunks)}));
    });
    request.setTimeout(15_000,()=>request.destroy(new Error("source request timed out")));
    request.on("error",reject);request.end();
  });
}
async function acquire(input:CorpusInput):Promise<{bytes:Buffer;mediaType:string}>{
  if(input.sourceKind==="public-web"){
    const initial=new URL(String(input.locator));if(initial.protocol!=="https:")throw new Error("source protocol is not allowed");let current=initial;
    for(let redirects=0;redirects<=3;redirects++){
      const addresses=await dns.lookup(current.hostname,{all:true,verbatim:true});if(!addresses.length||addresses.some(({address})=>blocked(address)))throw new Error("source address is not allowed");
      const selected=addresses[0]!;const response=await getPinned(current,selected.address,selected.family);
      if([301,302,303,307,308].includes(response.status)){const raw=response.headers.location;const location=Array.isArray(raw)?raw[0]:raw;if(!location)throw new Error("source redirect has no location");current=new URL(location,current);if(current.protocol!=="https:")throw new Error("source redirect protocol is not allowed");continue;}
      if(response.status<200||response.status>=300)throw new Error(`source returned ${response.status}`);const rawLength=response.headers["content-length"];const length=Number(Array.isArray(rawLength)?rawLength[0]:rawLength??0);if(length>6_000_000)throw new Error("source is too large");const rawType=response.headers["content-type"];const mediaType=String(Array.isArray(rawType)?rawType[0]:rawType??"application/octet-stream").split(";")[0]!.toLowerCase();return {bytes:response.bytes,mediaType};
    }throw new Error("too many source redirects");
  }
  if(input.contentBase64){const bytes=Buffer.from(input.contentBase64,"base64");if(bytes.byteLength>6_000_000||bytes.toString("base64")!==input.contentBase64)throw new Error("uploaded content is invalid or too large");return {bytes,mediaType:input.mediaType??"application/octet-stream"};}
  return {bytes:Buffer.from(JSON.stringify({title:input.title,summary:input.summary,tags:input.tags})),mediaType:"application/json"};
}
createServer(async(request,response)=>{
  if(request.url==="/health"||request.url==="/ready"){response.writeHead(200,{"content-type":"application/json"});return response.end('{"status":"ready"}');}
  const cleanup=/^\/v1\/acquisitions\/([a-f0-9]{64})$/u.exec(request.url??"");
  if(cleanup&&request.method==="DELETE"){
    const supplied=Buffer.from(String(request.headers.authorization??"").replace(/^Bearer /,"")),expected=Buffer.from(secret);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){response.writeHead(401);return response.end();}
    await unlink(join(root,cleanup[1]!)).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});response.writeHead(204);return response.end();
  }
  if(request.url!=="/v1/acquisitions"||request.method!=="POST"){response.writeHead(404);return response.end();}
  try{
    const supplied=Buffer.from(String(request.headers.authorization??"").replace(/^Bearer /,""));const expected=Buffer.from(secret);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){response.writeHead(401);return response.end();}
    const chunks:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>2_000_000)throw new Error("acquisition request is too large");chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString("utf8")) as CorpusInput;validateSource(input);const acquired=await acquire(input);
    const allowed=["application/json","text/html","text/plain","image/png","image/jpeg","image/webp","image/svg+xml","font/woff2"];if(!allowed.includes(acquired.mediaType))throw new Error("source media type is not allowed");
    if(acquired.mediaType==="image/svg+xml"&&/(<script|on[a-z]+\s*=|javascript:|<foreignObject)/iu.test(acquired.bytes.toString("utf8")))throw new Error("active SVG is not allowed");
    const digest=createHash("sha256").update(acquired.bytes).digest("hex");await writeFile(join(root,digest),acquired.bytes,{flag:"wx",mode:0o600}).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="EEXIST")throw error;});
    const normalized={...input,contentBase64:undefined,mediaType:acquired.mediaType,sourceContentDigest:`sha256:${digest}`};
    response.writeHead(202,{"content-type":"application/json"});response.end(JSON.stringify({quarantineDigest:`sha256:${digest}`,contentBase64:acquired.bytes.toString("base64"),normalized}));
  }catch(error){response.writeHead(422,{"content-type":"application/json"});response.end(JSON.stringify({error:error instanceof Error?error.message:"acquisition failed"}));}
}).listen(Number(process.env.PORT??8080),"0.0.0.0");
