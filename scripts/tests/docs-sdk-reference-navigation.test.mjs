import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateSdkReference} from '../docs-sdk-reference.mjs';
import {markdownInlineLinks,markdownAnchorEntries} from '../lib/docs-markdown-anchors.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const revision='586f1f558a673c4df51c0afb9ea535c814b933b1';

test('dynamic export index and canonical task links reach every actual named-entry anchor',()=>{
  const result=generateSdkReference({root,revision});
  const index=result.generatedMarkdown.split('## Export index\n')[1].split('\n## ')[0];
  const indexLinks=markdownInlineLinks(index);
  const anchors=new Set(markdownAnchorEntries(result.generatedMarkdown).map(entry=>entry.anchor));
  assert.equal(indexLinks.length,result.inventory.exports.length);
  for(const item of result.inventory.exports){
    const link=indexLinks.find(link=>link.raw.startsWith('[`'+item.name+'`]'));
    assert.ok(link,'missing discovered export '+item.name);
    assert.ok(anchors.has(link.destination.slice(1)),'missing named-entry anchor '+link.destination);
  }
  const canonical=fs.readFileSync(path.join(root,'docs/site/reference/sdk.md'),'utf8');
  const tasks=canonical.split('## Find the contract you need\n')[1].split('\n## ')[0];
  const taskLinks=markdownInlineLinks(tasks).filter(link=>link.destination.startsWith('sdk-exports.md#'));
  assert.equal(taskLinks.length,13);
  for(const link of taskLinks)assert.ok(anchors.has(link.destination.split('#')[1]));
  const example=canonical.split('### A safe local example\n')[1].split('```ts')[0];
  assert.match(example,/Node\.js 24/);
  const prep=markdownInlineLinks(example).find(link=>link.destination==='../extend/developer-handbook.md#prepare-a-clean-checkout');
  assert.ok(prep);
  assert.ok(markdownAnchorEntries(fs.readFileSync(path.join(root,'docs/site/extend/developer-handbook.md'),'utf8')).some(entry=>entry.anchor==='prepare-a-clean-checkout'));
});
