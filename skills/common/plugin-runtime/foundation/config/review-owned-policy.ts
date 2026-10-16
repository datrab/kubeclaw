import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
export interface ReviewPolicySelection {readonly schemaVersion:'review-policy-selection.v1';readonly file:string;readonly profile:string}
export interface ReviewPolicyCapture {readonly schemaVersion:'review-policy-capture.v1';readonly source:Readonly<{file:string;profile:string}>;readonly settings:Readonly<Record<string,unknown>>}
const schema=JSON.parse(fs.readFileSync(new URL('./review-owned-policy.schema.json',import.meta.url),'utf8'));
const Constructor=Ajv2020 as unknown as new(options:object)=>{compile(schema:object):(value:unknown)=>boolean};
const validate=new Constructor({strict:true,allErrors:true}).compile(schema);
const object=(v:unknown,keys:string):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(',')===keys;
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function captureReviewPolicy(value:unknown):ReviewPolicyCapture {
 if(!object(value,'schemaVersion,settings,source') || value.schemaVersion!=='review-policy-capture.v1' || !object(value.source,'file,profile')
   || typeof value.source.file!=='string'||!path.isAbsolute(value.source.file)||typeof value.source.profile!=='string'||!value.source.profile ||!validate(value.settings))throw new Error('REVIEW_POLICY_CAPTURE_INVALID');
 return freeze(structuredClone(value)) as unknown as ReviewPolicyCapture;
}
export function loadReviewPolicy(selection:unknown,directory:string):ReviewPolicyCapture {
 if(!object(selection,'file,profile,schemaVersion')||selection.schemaVersion!=='review-policy-selection.v1'||typeof selection.file!=='string'||!selection.file||typeof selection.profile!=='string'||!selection.profile)throw new Error('REVIEW_POLICY_SELECTION_INVALID');
 const file=fs.realpathSync(path.resolve(directory,selection.file));const document=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!object(document,'profiles,schemaVersion')||document.schemaVersion!=='review-owned-policy-document.v1'||!document.profiles||typeof document.profiles!=='object'||Array.isArray(document.profiles)||!Object.hasOwn(document.profiles,selection.profile))throw new Error('REVIEW_POLICY_DOCUMENT_INVALID');
 const profiles=document.profiles as Record<string,unknown>;
 for(const value of Object.values(profiles)){if(!object(value,'settings')||!validate(value.settings))throw new Error('REVIEW_POLICY_PROFILE_INVALID');}
 return captureReviewPolicy({schemaVersion:'review-policy-capture.v1',source:{file,profile:selection.profile},settings:(profiles[selection.profile] as {settings:unknown}).settings});
}
