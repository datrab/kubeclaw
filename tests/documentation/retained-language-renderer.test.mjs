import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { editorialOwners } from '../../scripts/lib/docs-configuration-editorial-language.mjs';
import { loadRetainedConfigurationSnapshot } from '../../scripts/lib/docs-retained-source.mjs';
import { buildHistoricalOwners } from '../../scripts/lib/docs-retained-configuration-owners.mjs';
import { projectRetainedInventoryLanguage } from '../../scripts/lib/docs-retained-configuration-projection.mjs';
import { renderRetainedConfigurationReferences } from '../../scripts/lib/docs-retained-configuration-renderer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifactRevision = '145da1d0b30fb3b636c4b03fb3d3252819ee2bf5';
const sourceRevision = '6fa4830a48244d29655104a5be58957d5fa87d2f';
test('full historical renderer reproduces original pages and preserves all rows and upstream quotations after editorial projection', () => {
  const snapshot = loadRetainedConfigurationSnapshot({ root, artifactRevision, sourceRevision });
  const original = snapshot.inventories;
  const owners = buildHistoricalOwners({ ...original, readSourceText: snapshot.readSourceText,
    readArtifactJson: snapshot.readArtifactJson });
  const projected = projectRetainedInventoryLanguage({ ...original, historicalOwners: owners });
  const args = { ...original, secrets: original.secretSetup, readSourceText: snapshot.readSourceText,
    artifactRevision, sourceRevision };
  const baseline = renderRetainedConfigurationReferences(args);
  const next = renderRetainedConfigurationReferences({ ...args, ...projected, banner: true,
    editorialRevision: 'ae67b6204435bb104e00d85091969da53ede415c',
    editorialSourcePath: 'scripts/lib/docs-configuration-editorial-language.mjs' });
  const rows = text => text.split('\n').filter(line => line.startsWith('| ')).length;
  for (const [relative, text] of baseline) {
    const expected = execFileSync('git', ['show', `${artifactRevision}:${relative}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(text, expected, `historical baseline differs: ${relative}`);
    const generatedBody = page => {
      const start = page.indexOf('<!-- BEGIN GENERATED:');
      assert(start >= 0, `generated boundary absent: ${relative}`);
      return page.slice(start);
    };
    assert.equal(rows(generatedBody(next.get(relative))), rows(generatedBody(text)),
      `historical generated rows lost: ${relative}`);
    assert(next.get(relative).includes('This view does not perform current discovery'));
    const published = execFileSync('git', ['show', `ae67b6204435bb104e00d85091969da53ede415c:${relative}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    assert.equal(rows(next.get(relative)), rows(published), `published complete-page rows lost: ${relative}`);
    const publishedIntroduction = published.split('## Summary\n\n')[1].split('<!-- BEGIN GENERATED:')[0].trim();
    assert(next.get(relative).includes(publishedIntroduction), `published operator guidance lost: ${relative}`);

  }
  const helm = baseline.get('docs/site/reference/helm-values.md');
  const changed = next.get('docs/site/reference/helm-values.md');
  const anchors = [...helm.matchAll(/<a id="api-collection-[a-f0-9]+"><\/a>/gu)];
  assert.equal(anchors.length, 170);
  for (const { index } of anchors) {
    const end = helm.indexOf('\n## ', index);
    assert(changed.includes(helm.slice(index, end < 0 ? helm.length : end)), 'upstream quotation changed');
  }
  const countFields = text => [...text.matchAll(/— (\d+) discovered fields, including lists and maps/gu)]
    .reduce((sum, match) => sum + Number(match[1]), 0);
  assert.equal(countFields(changed), 3813);
  assert.equal(projected.runtimeInputs.environment.length, 435);
  const expectedObserver=JSON.parse(fs.readFileSync(new URL('./fixtures/retained-observer-editorial.expected.json',import.meta.url),'utf8'));
  const observerPointers=new Set(expectedObserver.editorial.map(change=>change.jsonPointer));
  const pointerValues=changes=>changes.map(({inventory,jsonPointer,oldValue,newValue})=>({inventory,jsonPointer,oldValue,newValue})).sort((a,b)=>(a.inventory+a.jsonPointer).localeCompare(b.inventory+b.jsonPointer));
  assert.deepEqual(pointerValues(projected.changes.filter(change=>!observerPointers.has(change.jsonPointer))),pointerValues(expectedObserver.publishedBaselineEditorial));
  const actualObserver=projected.changes.filter(change=>observerPointers.has(change.jsonPointer)).map(({inventory,jsonPointer,oldValue,newValue})=>({inventory,jsonPointer,oldValue,newValue})).sort((a,b)=>a.jsonPointer.localeCompare(b.jsonPointer));
  assert.deepEqual(actualObserver,expectedObserver.editorial.map(({inventory,jsonPointer,oldValue,newValue})=>({inventory,jsonPointer,oldValue,newValue})).sort((a,b)=>a.jsonPointer.localeCompare(b.jsonPointer)));
  assert.equal(projected.changes.length,106+expectedObserver.editorial.length);
  for(const change of expectedObserver.semantic){const parts=change.jsonPointer.slice(1).split('/');let value=projected.runtimeInputs;for(const part of parts)value=value[part];assert.equal(value,change.oldValue,'v1 must not silently correct historical boolean meaning');}
  for (const [file, fieldPath] of [['examples/buster-values.yaml', '$.serviceAccount.name'], ['examples/nova-values.yaml', '$.processor.enabled']]) {
    const section = page => { const start = page.indexOf(`<summary><code>${file}</code>`); assert(start >= 0); return page.slice(start, page.indexOf('</details>', start)); };
    const currentRow = section(changed).split('\n').find(line => line.startsWith(`| \`${fieldPath}\` |`));
    const historicalRow = section(helm).split('\n').find(line => line.startsWith(`| \`${fieldPath}\` |`));
    assert(currentRow && historicalRow);
    assert(currentRow.includes(editorialOwners.unusedHelmExampleLeaf), 'unused field scope is not visible');
    assert(currentRow.includes('Required before use: Add a source-backed template/Application/deploy binding or remove the unused value.'));
    assert(!currentRow.includes('No checked-in render or deploy path selects that profile'));
    assert(!currentRow.includes('This file is not selected by a checked-in deployment path.'));
    assert(historicalRow.includes('No checked-in render or deploy path selects that profile'), 'historical baseline was silently rewritten');
    const raw = original.configurationValues.files.find(item => item.path === file).documents.flatMap(item => item.fields).find(item => item.path === fieldPath);
    assert.equal(raw.meaning.status, 'inactive-profile', 'protected historical classification changed');
  }

  assert(projected.preservation.allNonEditorialPointersEqual);
  assert(projected.preservation.secretsEqual);
  assert.throws(() => renderRetainedConfigurationReferences({ ...args, sourceRevision: artifactRevision }),
    /UNSUPPORTED_RETAINED_RENDERER_SOURCE_VERSION/);
});

test('observer projection rejects changed, missing, duplicate and retyped historical tuples', () => {
  const snapshot=loadRetainedConfigurationSnapshot({root,artifactRevision,sourceRevision});
  for(const mutate of [
    runtime=>{runtime.environment.find(entry=>entry.name==='OPENCLAW_AGENT_OBSERVER_ENABLED').consumerContracts[0].defaultBehavior='foreign default';},
    runtime=>{runtime.environment.find(entry=>entry.name==='OPENCLAW_AGENT_OBSERVER_ENABLED').consumerContracts=[];},
    runtime=>{const entry=runtime.environment.find(entry=>entry.name==='OPENCLAW_AGENT_OBSERVER_ENABLED');entry.consumerContracts.push(structuredClone(entry.consumerContracts[0]));},
    runtime=>{runtime.environment.find(entry=>entry.name==='OPENCLAW_AGENT_OBSERVER_ENABLED').consumerContracts[0].emptyBehavior=7;},
  ]){
    const runtimeInputs=structuredClone(snapshot.inventories.runtimeInputs);mutate(runtimeInputs);
    assert.throws(()=>buildHistoricalOwners({runtimeInputs,configurationValues:snapshot.inventories.configurationValues,readSourceText:snapshot.readSourceText,readArtifactJson:snapshot.readArtifactJson}),/HISTORICAL_ENV_/);
  }
  const changedModule=path=>snapshot.readSourceText(path)+(path==='scripts/docs-runtime-consumer-contracts.mjs'?'\n':'');
  assert.throws(()=>buildHistoricalOwners({...snapshot.inventories,readSourceText:changedModule,readArtifactJson:snapshot.readArtifactJson}),/HISTORICAL_OBSERVER_WHOLE_SOURCE_GRAMMAR_DRIFT/);
});
