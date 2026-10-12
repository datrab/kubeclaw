import assert from 'node:assert/strict';

import { buildTopologyGroups, compactRegionTopologyAssignmentCount, compactReviewTopology,
  compactReviewTopologyRelationKeys, compactTopologyConnections, compactTopologyRegions,
  splitTopologyGroup } from '../src/scalable-review-topology.ts';

const separator = '\0';
const relationKeys = [
  ['imports', 'src/b.ts', 'src/a.ts', 'typescript-module', 'src/b.ts:7', 'exact'].join(separator),
  ['uses_network', 'src/b.ts', 'resource:network', 'typescript-boundary', 'src/b.ts:11', 'derived'].join(separator),
  ['references_schema', 'src/a.ts', 'schema/a.json', 'json-reference', 'manifest-entry', 'uncertain'].join(separator),
];
const batches = [
  { relationKeys: relationKeys.slice(0, 2), boundaryIds: ['boundary:2'],
    sliceIds: ['slice:2', 'slice:1'], paths: ['src/b.ts', 'src/a.ts'] },
  { relationKeys: relationKeys.slice(2), boundaryIds: ['boundary:1'],
    sliceIds: ['slice:1', 'slice:3'], paths: ['schema/a.json', 'src/a.ts'] },
];
const groups = buildTopologyGroups(batches);
assert.equal(groups.length, 1);
const compact = compactReviewTopology(groups[0]);
assert.deepEqual(compact.relationFields,
  ['type', 'fromPath', 'toPath', 'extractor', 'provenance', 'confidence']);
assert.deepEqual(compact.sourcePathIndexes.map((index) => compact.paths[index]),
  ['schema/a.json', 'src/a.ts', 'src/b.ts']);
const restored = compactReviewTopologyRelationKeys(compact);
assert.deepEqual(restored, [...relationKeys].sort());
assert.deepEqual(buildTopologyGroups(batches, 2, 10).map(({ relationKeys: values }) => values.length), [2, 1]);
const split = splitTopologyGroup(groups[0]);
assert.deepEqual(split.flatMap(({ relationKeys: values }) => values), groups[0].relationKeys);
assert.equal(split.every(({ relationKeys: values }) => values.length > 0), true);
const regionTopology = compactTopologyRegions(split);
assert.equal(regionTopology.regions.length, 2);
assert.equal(regionTopology.connectionCount, 1);
assert.deepEqual(regionTopology.paths, ['src/b.ts']);
assert.equal(regionTopology.connectionRows, '0:0,1');
assert.equal(regionTopology.portRows, '0,0,1,0,1,1;0,1,1,1,0,1');
const firstConnection = compactTopologyConnections(regionTopology, [0]);
assert.equal(compactRegionTopologyAssignmentCount(firstConnection), 2);
const fanoutGroups = Array.from({ length: 100 }, (_value, index) => ({
  relationKeys: [[
    'imports', `src/leaf-${index}.ts`, 'src/hub.ts', 'fixture', `src/leaf-${index}.ts:1`, 'exact',
  ].join(separator)], boundaryIds: [], sliceIds: [], paths: [`src/leaf-${index}.ts`, 'src/hub.ts'],
}));
const fanoutTopology = compactTopologyRegions(fanoutGroups);
assert.equal(fanoutTopology.connectionCount, 1);
assert.equal(fanoutTopology.connectionRows.split(':')[1].split(',').length, fanoutGroups.length);
assert.equal(fanoutTopology.portRows.split(';').length, fanoutGroups.length);
const disjointGroups = ['one', 'two', 'three', 'four'].map((name, index) => ({
  relationKeys: [[
    'imports', `src/${name}.ts`, index < 2 ? 'src/hub-a.ts' : 'src/hub-b.ts',
    'fixture', `src/${name}.ts:1`, 'exact',
  ].join(separator)], boundaryIds: [], sliceIds: [],
  paths: [`src/${name}.ts`, index < 2 ? 'src/hub-a.ts' : 'src/hub-b.ts'],
}));
const disjointTopology = compactTopologyRegions(disjointGroups);
const disjointSlice = compactTopologyConnections(disjointTopology, [0]);
assert.equal(disjointTopology.regions.length, 4);
assert.equal(disjointSlice.regions.length, 2);
assert.equal(disjointSlice.connectionRows, '0:0,1');
assert.equal(disjointSlice.portRows.split(';').every((row) => Number(row.split(',')[1]) < 2), true);
assert.throws(() => compactReviewTopology({ relationKeys: ['invalid'], boundaryIds: [], sliceIds: [], paths: [] }),
  /relation key is invalid/u);
assert.throws(() => compactReviewTopologyRelationKeys({ ...compact, paths: [] }), /relation is invalid/u);
assert.throws(() => compactReviewTopologyRelationKeys({ ...compact, relationFields: [] }), /fields are invalid/u);

console.log(JSON.stringify({ ok: true, suite: 'scalable-review-topology' }));
