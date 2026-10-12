interface TopologyBatch {
  readonly relationKeys: readonly string[]; readonly boundaryIds: readonly string[];
  readonly sliceIds: readonly string[]; readonly paths: readonly string[];
}
export interface TopologyGroup extends TopologyBatch {}
export type CompactTopologyRelation = readonly [string, number, number, string, number | string, string];
export interface CompactReviewTopology {
  readonly relationFields: readonly ['type', 'fromPath', 'toPath', 'extractor', 'provenance', 'confidence'];
  readonly paths: readonly string[];
  readonly sourcePathIndexes: readonly number[];
  readonly relations: readonly CompactTopologyRelation[];
}
export interface CompactRegionTopology {
  readonly regionFields: readonly ['relationCount', 'pathCount', 'sourcePathCount', 'relationTypes', 'confidences'];
  readonly connectionFields: readonly ['sharedPath', 'regionIndexes'];
  readonly portFields: readonly ['sharedPath', 'region', 'direction', 'type', 'confidence', 'multiplicity'];
  readonly regions: readonly (readonly [number, number, number, readonly string[], readonly string[]])[];
  readonly paths: readonly string[];
  readonly relationTypes: readonly string[];
  readonly confidences: readonly string[];
  readonly connectionCount: number;
  readonly connectionRows: string;
  readonly portRows: string;
}

type RegionConnection = readonly [number, readonly number[]];
type RegionPort = readonly [number, number, 'in' | 'out', number, number, number];

function parseConnectionRows(value: string): readonly RegionConnection[] {
  if (!value) return [];
  return value.split(';').map((row) => {
    const [path, regions = ''] = row.split(':');
    return Object.freeze([Number(path), Object.freeze(regions ? regions.split(',').map(Number) : [])] as const);
  });
}

function parsePortRows(value: string): readonly RegionPort[] {
  if (!value) return [];
  return value.split(';').map((row) => {
    const [path, region, direction, type, confidence, multiplicity] = row.split(',');
    return Object.freeze([Number(path), Number(region), direction === '1' ? 'out' : 'in',
      Number(type), Number(confidence), Number(multiplicity)] as const);
  });
}

function connectionRows(values: readonly RegionConnection[]): string {
  return values.map(([path, regions]) => `${path}:${regions.join(',')}`).join(';');
}

function portRows(values: readonly RegionPort[]): string {
  return values.map(([path, region, direction, type, confidence, multiplicity]) => (
    [path, region, direction === 'out' ? 1 : 0, type, confidence, multiplicity].join(',')
  )).join(';');
}

const REGION_ROWS = new WeakMap<CompactRegionTopology, Readonly<{
  connections: readonly RegionConnection[]; ports: readonly RegionPort[];
}>>();

function regionRows(topology: CompactRegionTopology): Readonly<{
  connections: readonly RegionConnection[]; ports: readonly RegionPort[];
}> {
  let rows = REGION_ROWS.get(topology);
  if (!rows) {
    rows = Object.freeze({ connections: parseConnectionRows(topology.connectionRows),
      ports: parsePortRows(topology.portRows) });
    REGION_ROWS.set(topology, rows);
  }
  return rows;
}

function relationPaths(relationKeys: readonly string[]): ReadonlySet<string> {
  return new Set(relationKeys.flatMap((key) => {
    const fields = key.split('\0');
    if (fields.length !== 6) throw new Error(`scalable review topology relation key is invalid: ${key}`);
    return [fields[1] as string, fields[2] as string];
  }));
}

export function splitTopologyGroup(value: TopologyGroup): readonly [TopologyGroup, TopologyGroup] {
  if (value.relationKeys.length < 2) throw new Error('scalable review topology group cannot be split');
  const midpoint = Math.ceil(value.relationKeys.length / 2);
  const part = (relationKeys: readonly string[]): TopologyGroup => {
    const endpoints = relationPaths(relationKeys);
    return Object.freeze({ relationKeys: Object.freeze([...relationKeys]),
      boundaryIds: value.boundaryIds, sliceIds: value.sliceIds,
      paths: Object.freeze(value.paths.filter((path) => endpoints.has(path))) });
  };
  return Object.freeze([part(value.relationKeys.slice(0, midpoint)), part(value.relationKeys.slice(midpoint))]);
}

function group(batches: readonly TopologyBatch[]): TopologyGroup {
  return Object.freeze({
    relationKeys: Object.freeze([...new Set(batches.flatMap(({ relationKeys }) => relationKeys))].sort()),
    boundaryIds: Object.freeze([...new Set(batches.flatMap(({ boundaryIds }) => boundaryIds))].sort()),
    sliceIds: Object.freeze([...new Set(batches.flatMap(({ sliceIds }) => sliceIds))].sort()),
    paths: Object.freeze([...new Set(batches.flatMap(({ paths }) => paths))].sort()),
  });
}

export function buildTopologyGroups(
  batches: readonly TopologyBatch[], maxRelations = 2_200, maxPaths = 1_400,
): readonly TopologyGroup[] {
  const output: TopologyGroup[] = []; let current: TopologyBatch[] = [];
  for (const batch of batches) {
    const candidate = group([...current, batch]);
    if (current.length > 0 && (candidate.relationKeys.length > maxRelations || candidate.paths.length > maxPaths)) {
      output.push(group(current)); current = [];
    }
    current.push(batch);
  }
  if (current.length > 0) output.push(group(current));
  return Object.freeze(output);
}

function provenance(value: string, source: string): number | string {
  const match = new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}:(\\d+)$`, 'u').exec(value);
  return match ? Number(match[1]) : value;
}

export function compactReviewTopology(groupValue: TopologyGroup): CompactReviewTopology {
  const records = groupValue.relationKeys.map((key) => {
    const fields = key.split('\0');
    if (fields.length !== 6) throw new Error(`scalable review topology relation key is invalid: ${key}`);
    return fields as [string, string, string, string, string, string];
  });
  const paths = Object.freeze([...new Set(records.flatMap(([, from, to]) => [from, to]))].sort());
  const indexes = new Map(paths.map((path, index) => [path, index]));
  const relations = Object.freeze(records.map(([type, from, to, extractor, proof, confidence]) => Object.freeze([
    type, indexes.get(from) as number, indexes.get(to) as number, extractor, provenance(proof, from), confidence,
  ] as const)));
  return Object.freeze({
    relationFields: Object.freeze(['type', 'fromPath', 'toPath', 'extractor', 'provenance', 'confidence'] as const),
    paths, sourcePathIndexes: Object.freeze(groupValue.paths.map((path) => indexes.get(path))
      .filter((index): index is number => index !== undefined).sort((left, right) => left - right)), relations,
  });
}

// eslint-disable-next-line max-lines-per-function -- One complete pass keeps shared-path port indexes deterministic.
export function compactTopologyRegions(groups: readonly TopologyGroup[]): CompactRegionTopology {
  const regionPaths = groups.map(({ relationKeys }) => relationPaths(relationKeys));
  const regions = Object.freeze(groups.map(({ relationKeys, paths }, index) => {
    const records = relationKeys.map((key) => key.split('\0'));
    return Object.freeze([relationKeys.length, regionPaths[index]?.size ?? 0, paths.length,
      Object.freeze([...new Set(records.map((value) => value[0] as string))].sort()),
      Object.freeze([...new Set(records.map((value) => value[5] as string))].sort())] as const);
  }));
  const memberships = new Map<string, number[]>();
  regionPaths.forEach((paths, regionIndex) => paths.forEach((value) => {
    const indexes = memberships.get(value) ?? []; indexes.push(regionIndex); memberships.set(value, indexes);
  }));
  const paths = Object.freeze([...memberships].filter(([, indexes]) => indexes.length > 1)
    .map(([value]) => value).sort());
  const pathIndexes = new Map(paths.map((path, index) => [path, index]));
  const incident = groups.flatMap(({ relationKeys }, regionIndex) => relationKeys.flatMap((key) => {
    const fields = key.split('\0');
    if (fields.length !== 6) throw new Error(`scalable review topology relation key is invalid: ${key}`);
    const [type, from, to, , , confidence] = fields as [string, string, string, string, string, string];
    return Object.freeze([
      ...(pathIndexes.has(from) ? [[from, regionIndex, 'out', type, confidence] as const] : []),
      ...(pathIndexes.has(to) ? [[to, regionIndex, 'in', type, confidence] as const] : []),
    ]);
  }));
  const relationTypes = Object.freeze([...new Set(incident.map(([, , , type]) => type))].sort());
  const confidences = Object.freeze([...new Set(incident.map(([, , , , confidence]) => confidence))].sort());
  const typeIndexes = new Map(relationTypes.map((value, index) => [value, index]));
  const confidenceIndexes = new Map(confidences.map((value, index) => [value, index]));
  const counts = new Map<string, number>();
  for (const [path, region, direction, type, confidence] of incident) {
    const key = [pathIndexes.get(path), region, direction, typeIndexes.get(type), confidenceIndexes.get(confidence)].join(':');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ports: readonly RegionPort[] = Object.freeze([...counts].map(([key, multiplicity]) => {
    const [path, region, direction, type, confidence] = key.split(':');
    return Object.freeze([Number(path), Number(region), direction as 'in' | 'out',
      Number(type), Number(confidence), multiplicity] as const);
  }));
  const connections: readonly RegionConnection[] = Object.freeze(paths.map((value, index) => Object.freeze([
    index, Object.freeze(memberships.get(value) as number[]),
  ] as const)));
  return Object.freeze({
    regionFields: Object.freeze(['relationCount', 'pathCount', 'sourcePathCount', 'relationTypes', 'confidences'] as const),
    connectionFields: Object.freeze(['sharedPath', 'regionIndexes'] as const),
    portFields: Object.freeze(['sharedPath', 'region', 'direction', 'type', 'confidence', 'multiplicity'] as const),
    regions, paths, relationTypes, confidences, connectionCount: connections.length,
    connectionRows: connectionRows(connections), portRows: portRows(ports),
  });
}

export function compactTopologyConnections(
  topology: CompactRegionTopology, connectionIndexes: readonly number[],
): CompactRegionTopology {
  const rows = regionRows(topology), connections = rows.connections;
  const selectedConnections = connectionIndexes.map((index) => {
    const connection = connections[index];
    if (!connection) throw new Error(`scalable review topology connection is missing: ${index}`);
    return connection;
  });
  const oldPaths = selectedConnections.map(([pathIndex]) => pathIndex);
  const selected = new Set(oldPaths), remap = new Map(oldPaths.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const ports = rows.ports.filter(([pathIndex]) => selected.has(pathIndex));
  const oldRegions = [...new Set(selectedConnections.flatMap(([, regionIndexes]) => regionIndexes))]
    .sort((left, right) => left - right);
  const regionRemap = new Map(oldRegions.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const oldTypes = [...new Set(ports.map(([, , , type]) => type))].sort((left, right) => left - right);
  const oldConfidences = [...new Set(ports.map(([, , , , confidence]) => confidence))].sort((left, right) => left - right);
  const typeRemap = new Map(oldTypes.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const confidenceRemap = new Map(oldConfidences.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  return Object.freeze({
    regionFields: topology.regionFields, connectionFields: topology.connectionFields,
    portFields: topology.portFields,
    regions: Object.freeze(oldRegions.map((index) => topology.regions[index] as CompactRegionTopology['regions'][number])),
    paths: Object.freeze(oldPaths.map((index) => topology.paths[index] as string)),
    relationTypes: Object.freeze(oldTypes.map((index) => topology.relationTypes[index] as string)),
    confidences: Object.freeze(oldConfidences.map((index) => topology.confidences[index] as string)),
    connectionCount: selectedConnections.length,
    connectionRows: connectionRows(selectedConnections.map(([, regionIndexes], index) => Object.freeze([
      index, Object.freeze(regionIndexes.map((region) => regionRemap.get(region) as number)),
    ] as const))),
    portRows: portRows(ports.map(([path, region, direction, type, confidence, multiplicity]) => Object.freeze([
      remap.get(path) as number, regionRemap.get(region) as number, direction, typeRemap.get(type) as number,
      confidenceRemap.get(confidence) as number, multiplicity,
    ] as const))),
  });
}

export function compactRegionTopologyAssignmentCount(topology: CompactRegionTopology): number {
  return regionRows(topology).ports.reduce((total, port) => total + port[5], 0);
}

export function compactReviewTopologyRelationKeys(topology: CompactReviewTopology): readonly string[] {
  const expected = ['type', 'fromPath', 'toPath', 'extractor', 'provenance', 'confidence'];
  if (topology.relationFields.length !== expected.length
    || topology.relationFields.some((field, index) => field !== expected[index])) {
    throw new Error('scalable review compact topology relation fields are invalid');
  }
  return Object.freeze(topology.relations.map(([type, fromIndex, toIndex, extractor, proof, confidence]) => {
    const from = topology.paths[fromIndex], to = topology.paths[toIndex];
    if (from === undefined || to === undefined || !Number.isSafeInteger(fromIndex) || !Number.isSafeInteger(toIndex)
      || (typeof proof === 'number' && (!Number.isSafeInteger(proof) || proof < 1))) {
      throw new Error('scalable review compact topology relation is invalid');
    }
    const restoredProof = typeof proof === 'number' ? `${from}:${proof}` : proof;
    return [type, from, to, extractor, restoredProof, confidence].join('\0');
  }));
}
