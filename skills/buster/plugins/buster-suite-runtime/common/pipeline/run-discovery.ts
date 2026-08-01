import fs from 'node:fs';
import path from 'node:path';
import { canonicalFingerprint } from './portable-artifacts.ts';

function lines(file:string){return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map((line,index)=>{try{return JSON.parse(line);}catch{throw new Error(`${file}:${index+1}: invalid run catalog record`);}}):[];}
function safe(root:string,reference:string){const target=path.resolve(root,reference);if(!target.startsWith(`${path.resolve(root)}${path.sep}`))throw new Error(`unsafe run catalog reference: ${reference}`);return target;}
export function discoverRuns(pipelineLogRoot:string){const catalogPath=path.join(pipelineLogRoot,'run-catalog.jsonl');return lines(catalogPath).map(record=>{const archivePath=safe(pipelineLogRoot,record.archive_reference);if(!fs.existsSync(archivePath))return{...record,valid:false,reason:'archive_missing'};const archive=JSON.parse(fs.readFileSync(archivePath,'utf8'));const{sha256,...unsigned}=archive;const valid=sha256===record.sha256&&canonicalFingerprint(unsigned)===sha256;return{...record,archive,archive_path:archivePath,valid,reason:valid?null:'archive_hash_mismatch'};});}
export function discoverLatestRun(pipelineLogRoot:string){const valid=discoverRuns(pipelineLogRoot).filter(item=>item.valid);return valid.at(-1)??null;}
export function requireLatestRun(pipelineLogRoot:string){const run=discoverLatestRun(pipelineLogRoot);if(!run)throw Object.assign(new Error('durable run catalog contains no verified run'),{code:'RUN_CATALOG_EMPTY'});return run;}
