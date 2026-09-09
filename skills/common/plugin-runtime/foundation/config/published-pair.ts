import fs, {type Stats} from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDirectoryDurable, withDurableStoreLock, writeDurableState } from '../observability/durable-delivery.ts';

const LIMIT = 64 * 1024 * 1024;
const DIRECTORY = '.scaffold-publication';
type Member = { name: string; digest: string; bytes: number };
type Manifest = { schemaVersion: 'published-json-pair.v1'; generation: string; members: [Member, Member] };
const digest = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');
const generationId = (members: readonly Member[]) => digest(JSON.stringify(members.map(member=>[member.name,member.digest,member.bytes])));
function fail(code: string): never { throw new Error(`PUBLISHED_PAIR_${code}: reconcile explicitly with scaffold --apply`); }
function namesValid(names: readonly [string,string]): void {
  if (names[0] === names[1] || names.some(name => !/^[a-z][a-z0-9.-]*\.json$/u.test(name))) fail('NAMES_INVALID');
}
function present(file: string): boolean {
  try { fs.lstatSync(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function pins(root: string): Map<string,Stats> {
  const result = new Map<string,Stats>(); let current = path.parse(root).root;
  for (const component of root.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,component); const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('DIRECTORY_INVALID'); result.set(current,stat);
  }
  return result;
}
function verifyPins(values: Map<string,Stats>): void {
  for (const [file,stat] of values) {
    const actual=fs.lstatSync(file);
    if(!actual.isDirectory()||actual.dev!==stat.dev||actual.ino!==stat.ino)fail('CHANGED');
  }
}
function same(a:Stats,b:Stats):boolean {return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;}
function read(file:string,maximum=LIMIT):Buffer {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>maximum)fail('FILE_INVALID');
    const buffer=Buffer.alloc(stat.size+1);let offset=0;
    while(offset<buffer.length){const count=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if(!count)break;offset+=count;}
    if(offset!==stat.size||!same(stat,fs.fstatSync(fd))||!same(stat,fs.lstatSync(file)))fail('CHANGED');
    return buffer.subarray(0,offset);
  }finally{fs.closeSync(fd);}
}
function validateMember(member:Member,name:string):void {
  if(!member||member.name!==name||!Number.isSafeInteger(member.bytes)||member.bytes<1||member.bytes>LIMIT
    ||!/^[a-f0-9]{64}$/u.test(member.digest)||Object.keys(member).sort().join(',')!=='bytes,digest,name')fail('MANIFEST_INVALID');
}
function manifestValue(bytes:Buffer,names:readonly [string,string]):Manifest {
  let value:Manifest;try{value=JSON.parse(bytes.toString());}catch{fail('MANIFEST_INVALID');}
  if(!value||value.schemaVersion!=='published-json-pair.v1'||!Array.isArray(value.members)||value.members.length!==2
    ||Object.keys(value).sort().join(',')!=='generation,members,schemaVersion')fail('MANIFEST_INVALID');
  value.members.forEach((member,index)=>validateMember(member,names[index]!));
  if(value.generation!==generationId(value.members))fail('MANIFEST_INVALID');return value;
}
/** A present but damaged publication never falls back to loose authored files. */
export function readPublishedPair(root:string,names:readonly [string,string],verifyCopies=true):readonly [unknown,unknown] {
  root=path.resolve(root);namesValid(names);const base=path.join(root,DIRECTORY);
  const rootPins=pins(root);
  if(!present(base)){
    const values=names.map(name=>{const file=path.join(root,name);return present(file)?JSON.parse(read(file).toString()):null;});
    if(present(base))fail('CHANGED');verifyPins(rootPins);return values as [unknown,unknown];
  }
  const basePins=pins(base);const pointer=path.join(base,'current.json');
  if(!present(pointer))fail('UNCOMMITTED');
  const bytes=read(pointer,4096),manifest=manifestValue(bytes,names);
  const generation=path.join(base,manifest.generation),generationPins=pins(generation);
  const values=manifest.members.map(member=>{
    const content=read(path.join(generation,member.name));
    if(content.length!==member.bytes||digest(content)!==member.digest)fail('MEMBER_INVALID');
    if(verifyCopies&&!content.equals(read(path.join(root,member.name))))fail('MATERIALIZATION_DIVERGED');
    try{return JSON.parse(content.toString());}catch{fail('MEMBER_INVALID');}
  });
  if(!read(pointer,4096).equals(bytes))fail('CHANGED');
  verifyPins(rootPins);verifyPins(basePins);verifyPins(generationPins);
  return values as [unknown,unknown];
}
function targetValid(file:string):void {
  if(!present(file))return;
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)fail('TARGET_INVALID');
}
async function syncDirectory(directory:string):Promise<void> {const handle=await fsp.open(directory,'r');try{await handle.sync();}finally{await handle.close();}}
async function immutableFile(file:string,bytes:Buffer):Promise<void> {
  if(present(file)){if(!read(file).equals(bytes))fail('GENERATION_CONFLICT');return;}
  const temporary=`${file}.${crypto.randomUUID()}.tmp`;const handle=await fsp.open(temporary,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  await fsp.link(temporary,file);await fsp.unlink(temporary);await syncDirectory(path.dirname(file));
}
async function materialize(file:string,bytes:Buffer):Promise<void> {
  targetValid(file);const temporary=`${file}.${crypto.randomUUID()}.tmp`;const handle=await fsp.open(temporary,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  targetValid(file);await fsp.rename(temporary,file);await syncDirectory(path.dirname(file));
}
/** The single current.json rename commits both members; loose files alone never authorize execution. */
export async function publishJsonPair(root:string,names:readonly [string,string],values:readonly [unknown,unknown]):Promise<void> {
  root=path.resolve(root);namesValid(names);const rootPins=pins(root);
  const contents=values.map(value=>Buffer.from(`${JSON.stringify(value,null,2)}\n`));
  if(contents.some(bytes=>bytes.length>LIMIT))fail('SIZE_EXCEEDED');
  const members=contents.map((bytes,index)=>({name:names[index]!,digest:digest(bytes),bytes:bytes.length})) as [Member,Member];
  const manifest:Manifest={schemaVersion:'published-json-pair.v1',generation:generationId(members),members};
  const base=path.join(root,DIRECTORY),pointer=path.join(base,'current.json');
  names.forEach(name=>targetValid(path.join(root,name)));targetValid(pointer);
  await ensureDirectoryDurable(base);
  await withDurableStoreLock(pointer,async()=>{
    const basePins=pins(base);names.forEach(name=>targetValid(path.join(root,name)));targetValid(pointer);
    const generation=path.join(base,manifest.generation);await ensureDirectoryDurable(generation);const generationPins=pins(generation);
    for(let index=0;index<2;index++)await immutableFile(path.join(generation,names[index]!),contents[index]!);
    verifyPins(rootPins);verifyPins(basePins);verifyPins(generationPins);
    for(let index=0;index<2;index++)await materialize(path.join(root,names[index]!),contents[index]!);
    verifyPins(rootPins);verifyPins(basePins);verifyPins(generationPins);
    await writeDurableState(pointer,manifest);
    readPublishedPair(root,names);
  });
}
