import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildSourceSurfaceMap, assertSourceSurfaceMap } from '../lib/docs-source-surface-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapFile = path.join(root, 'docs/site/reference/generated-documentation-map.json');
const committed = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const build = (file, mutate, pages = committed.pages) => buildSourceSurfaceMap(root, pages, candidate => {
  const value = read(candidate);
  if (candidate === file) mutate(value);
  return value;
});
const baseline = buildSourceSurfaceMap(root, committed.pages);
const stale = changed => assert.throws(() => assertSourceSurfaceMap(changed, baseline), /source-map stale\/orphan/u);

test('current inventory join and inverse bindings match the generated map', () => {
  assertSourceSurfaceMap(committed.sourceSurfaceMap, baseline);
  for (const domain of baseline.domains) {
    assert(domain.readerTask && domain.generator && domain.checks.length);
    for (const surface of domain.surfaces) {
      assert(surface.source && surface.owner);
      assert(baseline.pageSources.find(page => page.page === surface.target.split('#')[0]).sourceIds.includes(surface.sourceId));
    }
  }
});

// These are join-adapter tests, not substitutes for raw source/parser mutation
// suites. Each adapter consumes the real inventory shape and owning page roster.
const cases = [
  ['sdk-reference', data => data.exports, item => { item.name += 'Mutation'; }, item => { item.signature += ' mutation'; }],
  ['platform-surfaces', data => data.endpoints, item => { item.source += '.mutation'; }, item => { item.activationCondition = 'changed condition'; }],
  ['workflows', data => data.workflows, item => { item.path += '.mutation'; }, item => { item.triggers.push('mutation'); }],
  ['plugin-system', data => data.registrations, item => { item.id += '.mutation'; item.registrationId += '.mutation'; }, item => { item.kind += '.mutation'; }],
  ['configuration-values', data => data.files[0].documents[0].fields, item => { item.path += '.mutation'; }, item => { item.type = 'mutation'; }],
  ['configuration-schemas', data => data.files[0].fields, item => { item.path += '.mutation'; }, item => { item.type = 'mutation'; }],
  ['configuration-runtime-inputs', data => data.cliFlags, item => { item.name += '-mutation'; item.surface = 'operator-runtime'; }, item => { item.default += ' mutation'; }],
];
for (const [name, collection, rename, change] of cases) {
  const file = `docs/generated/inventory/${name}.json`;
  test(`${name}: add/change/remove modifies the join without count shortcuts`, () => {
    // The SDK name determines its real anchor. Add another entrypoint for an
    // existing name to exercise addition while keeping the target valid.
    stale(build(file, data => {
      const item = structuredClone(collection(data)[0]);
      if (name === 'sdk-reference') item.entrypoint += '/mutation';
      else rename(item);
      collection(data).push(item);
    }));
    stale(build(file, data => {
      const item = name === 'configuration-runtime-inputs'
        ? collection(data).find(item => item.surface === 'operator-runtime') : collection(data)[0];
      change(item);
    }));
    stale(build(file, data => {
      const list = collection(data);
      const index = name === 'configuration-runtime-inputs' ? list.findIndex(item => item.surface === 'operator-runtime') : list.length - 1;
      list.splice(index, 1);
    }));
  });
}

test('internal workflow and each package route to their actual owning reader page', () => {
  const workflows = baseline.domains.find(item => item.domain === 'workflow');
  assert(workflows.surfaces.filter(item => item.source === '.github/workflows/docs-checks.yaml')
    .every(item => item.target === 'docs/site/extend/documentation-maintenance.md#generate-only-owned-facts-then-check'));
  const plugins = baseline.domains.find(item => item.domain === 'plugin');
  for (const item of read('docs/generated/inventory/plugin-system.json').packages) {
    assert(plugins.surfaces.some(surface => surface.source === item.manifest && surface.target === `docs/site/extend/plugin-catalogue/${item.id}.md#package-reference`));
  }
});

test('wrong existing page, valid existing source ID, member omission and inverse omission fail', () => {
  let bad = structuredClone(baseline);
  bad.domains[0].surfaces[0].target = 'docs/site/reference/cli.md#defined-flags';
  stale(bad);
  bad = structuredClone(baseline);
  bad.domains[0].surfaces[0].sourceId = bad.domains[0].surfaces[1].sourceId;
  stale(bad);
  bad = structuredClone(baseline);
  const sdk = bad.domains.find(item => item.domain === 'sdk');
  sdk.surfaces.splice(sdk.surfaces.findIndex(item => item.sourceId.includes(':member:')), 1);
  // All present lengths/counts can be refreshed; exact membership still differs.
  bad.pageSources = bad.pageSources.map(page => ({ ...page, sourceIds: page.sourceIds.filter(sourceId => sdk.surfaces.some(item => item.sourceId === sourceId) || !sourceId.startsWith('sdk:')) }));
  stale(bad);
  bad = structuredClone(baseline);
  bad.pageSources[0].sourceIds.pop();
  stale(bad);
});

test('orphan source binding, removed canonical page, missing anchor and duplicate identity fail directly', () => {
  assert.throws(() => build('docs/generated/inventory/plugin-system.json', data => {
    const item = structuredClone(data.packages[0]);
    item.id += '.mutation';
    data.packages.push(item);
  }), /source-map orphan page/u);
  assert.throws(() => build('docs/config/platform-surface-map.json', data => {
    delete data.endpoints.identityTargets[Object.keys(data.endpoints.identityTargets)[0]];
  }), /source-map orphan source/u);
  assert.throws(() => build('', () => {}, committed.pages.filter(page => page.page !== 'docs/site/reference/sdk-exports.md')), /source-map orphan page/u);
  assert.throws(() => build('docs/config/platform-surface-map.json', data => {
    data.endpoints.identityTargets[Object.keys(data.endpoints.identityTargets)[0]] = 'docs/site/reference/cli.md#not-an-existing-anchor';
  }), /source-map orphan anchor/u);
  assert.throws(() => build('docs/generated/inventory/workflows.json', data => data.workflows.push(structuredClone(data.workflows[0]))), /source-map duplicate source identity/u);
});
