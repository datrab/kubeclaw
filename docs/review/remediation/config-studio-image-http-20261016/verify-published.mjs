import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const image = process.argv[2];
const code = image + '/role';
const { capturePipelineBootReceipts } = await import(pathToFileURL(code + '/skills/packages/plugin-foundation/config/pipeline-boot.mjs'));
const { loadStudioConfig } = await import(pathToFileURL(code + '/skills/packages/prism-engine/server/studio-config.ts'));
for (const id of ['150','250','600','canonical']) {
 const root = image + '/studio-proof/' + id;
 const expected = JSON.parse(fs.readFileSync(root + '/selection.json'));
 const capture = capturePipelineBootReceipts(root+'/studio-transport',root+'/generation/system','prism-studio',code,'/app/prism/skills');
 const actual = loadStudioConfig(capture, {});
 assert.deepEqual({port: actual.port, controlUrl: actual.control.href.replace(/\/$/, ''), controlTimeoutMs: actual.controlTimeoutMs}, expected);
 assert(Object.isFrozen(actual));
 const entry = JSON.parse(fs.readFileSync(root+'/author/pipeline.config.json'));
 const author = root+'/author/'+entry.components['prism-studio'];
 const original = fs.readFileSync(author);
 const changed = JSON.parse(original); changed.profiles.standard.settings.port=1;
 fs.writeFileSync(author, JSON.stringify(changed));
 assert.equal(loadStudioConfig(capture, {}).port, expected.port, 'original authenticated generation cannot refill from changed author');
 fs.writeFileSync(author, original);
 const negative = JSON.parse(fs.readFileSync(root+'/selection.json')); negative.port=1;
 assert.throws(()=>assert.deepEqual({port:actual.port,controlUrl:actual.control.href.replace(/\/$/, ''),controlTimeoutMs:actual.controlTimeoutMs},negative));
 console.log(id + ': genuine receipt/settings, original-after-author-mutation and wrong-selection negative PASS');
}
console.log('4/4 genuine generation captures; NOT image-user/Docker acceptance');
