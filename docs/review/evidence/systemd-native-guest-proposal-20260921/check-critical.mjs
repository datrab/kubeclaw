import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.getuid(),0);
for(const row of JSON.parse(fs.readFileSync('/guest-proof/critical.json','utf8'))){
 const digest=crypto.createHash('sha256').update(fs.readFileSync(row.path)).digest('hex');
 assert.equal(digest,row.sha256,row.path);
}
console.log('VM_CRITICAL_IDENTITIES_STATUS=0');
