import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

// These are executable regression inputs, not published documentation. Keep
// their original bytes authenticated when the reader tree is reorganized.
const root=new URL('../../fixtures/runtime-regressions/',import.meta.url);
const provenance=JSON.parse(fs.readFileSync(new URL('provenance.json',root),'utf8'));
test('relocated runtime regression fixtures retain authenticated pre-migration bytes',()=>{
  assert.equal(provenance.schemaVersion,'retained-runtime-regression-fixtures.v1');
  assert.equal(provenance.sourceRevision,'218343dd9101713c7892493ba856eb1aaba0809f');
  assert.equal(provenance.files.length,5);
  for(const entry of provenance.files){
    assert.match(entry.fixturePath,/^[a-zA-Z0-9.-]+$/u);
    const bytes=fs.readFileSync(new URL(entry.fixturePath,root));
    assert.equal(bytes.length,entry.bytes,entry.sourcePath);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.sourcePath);
    assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),entry.gitBlobSha1,entry.sourcePath);
  }
});
