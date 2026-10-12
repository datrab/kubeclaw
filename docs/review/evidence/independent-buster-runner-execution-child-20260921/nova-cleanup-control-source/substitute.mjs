import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
const spec=JSON.parse(fs.readFileSync(process.env.PROCESS_RETENTION_CONTROL_SPEC,'utf8'));
const target=pathToFileURL(spec.target).href;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const replacement=fs.readFileSync(spec.replacement);
assert.equal(hash(replacement),spec.replacementSha256);
registerHooks({load(url,context,next){
 const loaded=next(url,context);
 if(url!==target)return loaded;
 const source=Buffer.from(loaded.source);
 assert.equal(hash(source),spec.expectedCurrentSha256,'exact current lifecycle target required');
 fs.appendFileSync(spec.applicationLog,JSON.stringify({url,beforeSha256:hash(source),replacementSha256:hash(replacement)})+'\n');
 return {...loaded,source:replacement.toString('utf8')};
}});
