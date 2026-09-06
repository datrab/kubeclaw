import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installExternalPackage } from '../../../skills/common/plugin-runtime/foundation/packages/install.ts';
import { computePackageDigest } from '../../../skills/common/plugin-runtime/foundation/registry/digest.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-install-'));
try {
 const source=path.join(root,'source'),target=path.join(root,'installed');fs.mkdirSync(source);fs.mkdirSync(target);
 fs.writeFileSync(path.join(source,'broken.mjs'),'export function parse( {');
 fs.writeFileSync(path.join(source,'plugin.json'),JSON.stringify({id:'review.report',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',stages:[],adapters:[],observers:[],reportAdapters:[{id:'report',format:'review',contractVersion:1,module:'broken.mjs',export:'parse',mediaTypes:['application/json']}]}));
 const digest=computePackageDigest(source),canonicalSource='https://example.invalid/review/report';
 const installed=installExternalPackage({actorId:'operator:review',canonicalSource,sourceRoot:source,installationRoot:target,expectedDigest:digest,policy:{operatorIds:new Set(['operator:review']),allowedSourceDigests:new Map([[canonicalSource,[digest]]]),verifiedAttestations:new Map()},trustEvidence:{method:'source_digest_allowlist',verifier:'review'}});
 assert.equal(fs.readFileSync(path.join(installed.root,'broken.mjs'),'utf8'),'export function parse( {');
 console.log('PCR-PACKAGES-001: production installer accepts syntactically invalid report-adapter-only package');
} finally {fs.rmSync(root,{recursive:true,force:true});}
