import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stableJson } from './observability-contract.ts';

function required(value: unknown, name: string) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`); return value.trim(); }
function appendJsonl(file: string, value: any) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { encoding:'utf8', mode:0o600 }); }
function writeAtomic(file: string, value: string | Buffer) { fs.mkdirSync(path.dirname(file), { recursive:true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, value, {mode:0o600}); fs.renameSync(temp, file); }
export function runEvidenceRoot(config: any) {
  const runId = required(config?._runId ?? config?.run_id, 'run_id');
  const pipelineDir = required(config?.paths?.pipeline_log_dir ?? config?.pipeline_dir ?? (config?.paths?.swarm_dir ? path.join(config.paths.swarm_dir,'logs','pipeline') : null), 'pipeline log directory');
  return path.join(pipelineDir, 'runs', runId);
}
export function artifactPaths(config: any) {
  const root = runEvidenceRoot(config);
  return { root, blobs:path.join(root,'blobs','sha256'), catalog:path.join(root,'artifacts.jsonl'), quarantine:path.join(root,'quarantine.jsonl'), manifest:path.join(root,'run-manifest.json'), closure:path.join(root,'terminal-closure.json'), archive:path.join(root,'archive-manifest.json'), health:path.join(root,'producer-health.json'), evaluation:path.join(root,'evaluation-facts.jsonl') };
}
export function publishArtifact(config: any, input: any) {
  const paths = artifactPaths(config);
  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes ?? '', input.encoding ?? 'utf8');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const target = path.join(paths.blobs, hash.slice(0,2), hash.slice(2));
  fs.mkdirSync(path.dirname(target), {recursive:true});
  if (!fs.existsSync(target)) writeAtomic(target, bytes);
  const relative = path.relative(paths.root, target).split(path.sep).join('/');
  const logicalId = required(input.logical_id, 'logical_id');
  const artifactId = `artifact_${crypto.createHash('sha256').update(`${logicalId}\0${hash}`).digest('hex')}`;
  const existing = fs.existsSync(paths.catalog) ? fs.readFileSync(paths.catalog,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).find((item:any) => item.artifact_id === artifactId) : null;
  if (existing) return existing;
  const record = { schema_version:'artifact_published.v1', artifact_id:artifactId, logical_id:logicalId, kind:required(input.kind,'kind'), media_type:required(input.media_type,'media_type'), byte_length:bytes.length, sha256:hash, content_class:required(input.content_class ?? 'artifact','content_class'), producer:required(input.producer,'producer'), reference:relative, correlation:input.correlation, completeness:input.completeness ?? 'full', original_byte_length:input.original_byte_length ?? bytes.length, original_sha256:input.original_sha256 ?? hash, transformation:input.transformation ?? null, published_at:new Date().toISOString() };
  appendJsonl(paths.catalog, record);
  return record;
}
export function quarantinePayload(config:any, input:any) { const paths=artifactPaths(config); const record={schema_version:'quarantined_payload.v1',quarantine_id:`quarantine_${crypto.randomUUID()}`,quarantined_at:new Date().toISOString(),reason_code:required(input.reason_code,'reason_code'),producer:required(input.producer,'producer'),identity:input.identity??null,original_byte_length:input.original_byte_length??null,original_sha256:input.original_sha256??null}; appendJsonl(paths.quarantine,record); return record; }
export function canonicalFingerprint(value:any) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
export function verifyArtifactCatalog(config:any) { const paths=artifactPaths(config); const entries=fs.existsSync(paths.catalog)?fs.readFileSync(paths.catalog,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]; const errors=[]; for(const item of entries){const target=path.resolve(paths.root,item.reference);if(!target.startsWith(`${path.resolve(paths.root)}${path.sep}`)||!fs.existsSync(target)){errors.push({artifact_id:item.artifact_id,reason:'missing'});continue;}const bytes=fs.readFileSync(target);const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==item.sha256||bytes.length!==item.byte_length)errors.push({artifact_id:item.artifact_id,reason:'corrupt'});}return{ok:errors.length===0,count:entries.length,errors};}
export function writeCanonicalJson(file:string,value:any){writeAtomic(file,`${JSON.stringify(value,null,2)}\n`);return file;}
