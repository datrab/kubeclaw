import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { capturePipelineInputSet, hashPipelineInputSet, type PipelineInputMember } from './pipeline-input-set.ts';
const contract = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-input-contract.json', import.meta.url), 'utf8')) as {
  base: { inputGenerationSha256: string; members: PipelineInputMember[] };
  requiredRootReplacements: string[]; additions: PipelineInputMember[]; packageSources: PipelineInputMember[];
};
const same = (a: PipelineInputMember, b: PipelineInputMember) => a.relativePath === b.relativePath && a.byteLength === b.byteLength && a.sha256 === b.sha256;
const snapshot = (value: PipelineInputMember) => Object.freeze({ relativePath: value.relativePath, byteLength: value.byteLength, sha256: value.sha256 });

/** Closed declared composition, NOT admission or a v4 receipt. Root/schema
 * descriptors come from actual coordinated producer bytes, never hash defaults.
 * All historical member identities and explicit replaced-before/after pairs are
 * retained; no source/caller/native grant inferred from this unkeyed digest.
 */
export function composePipelineV10InputSet(rootReplacements: readonly PipelineInputMember[]) {
  if (hashPipelineInputSet(contract.base.members) !== contract.base.inputGenerationSha256 || contract.base.members.length !== 376) throw new Error('PIPELINE_V10_INPUT_BASE_CHANGED');
  // Exact codec validation also rejects path aliases, duplicate rows/bad sizes.
  hashPipelineInputSet(rootReplacements);
  if (rootReplacements.length !== contract.requiredRootReplacements.length
    || contract.requiredRootReplacements.some(name => !rootReplacements.some(row => row.relativePath === name))) throw new Error('PIPELINE_V10_INPUT_ROOT_SET');
  const members = new Map(contract.base.members.map(row => [row.relativePath, snapshot(row)]));
  const changes: { before: PipelineInputMember; after: PipelineInputMember }[] = [];
  const added: PipelineInputMember[] = [];
  const overlays = [...rootReplacements, ...contract.additions, ...contract.packageSources];
  hashPipelineInputSet(overlays); // No duplicate/overlapping delta authors.
  for (const raw of overlays) {
    const next = snapshot(raw), before = members.get(next.relativePath);
    if (before) {
      if (!same(before, next)) changes.push(Object.freeze({ before, after: next }));
    } else added.push(next);
    members.set(next.relativePath, next);
  }
  const complete = Object.freeze([...members.values()].sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath))));
  return Object.freeze({ schemaVersion: 'pipeline-v10-declared-input-set.v1' as const,
    inheritedInputGenerationSha256: contract.base.inputGenerationSha256, inheritedCount: 376,
    members: complete, replacements: Object.freeze(changes), additions: Object.freeze(added),
    inputGenerationSha256: hashPipelineInputSet(complete), activationAllowed: false as const });
}

/** Retained physical capture only. Does NOT produce legacy v3/v4 output or
 * authorize materialization/activation. Caller closes descriptors at boundary.
 */
export function capturePipelineV10DeclaredInputSet(root: string, rootReplacements: readonly PipelineInputMember[]) {
  const composition = composePipelineV10InputSet(rootReplacements);
  const capture = capturePipelineInputSet(root, composition.members);
  return Object.freeze({ composition, capture, activationAllowed: false as const });
}

/** Normal materializer source intake. Version detection is never a grant.
 * Legacy caller receives only its exact raw root descriptor; v10 receives the
 * COMPLETE declared set before semantic/caller/output admission (still denied).
 */
export function capturePipelineMaterializerInputSource(authorRoot: string) {
  if (!path.isAbsolute(authorRoot) || path.resolve(authorRoot) !== authorRoot || fs.realpathSync(authorRoot) !== authorRoot) throw new Error('PIPELINE_INPUT_ROOT_INVALID');
  const observations: { file: string; fd: number; before: fs.BigIntStats; bytes: Buffer }[] = [];
  const unchanged = (a: fs.BigIntStats, b: fs.BigIntStats) => ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].every(key => a[key as keyof fs.BigIntStats] === b[key as keyof fs.BigIntStats]);
  const read = (file: string) => {
    if (fs.realpathSync(file) !== file) throw new Error('PIPELINE_INPUT_NOT_PHYSICAL');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd, { bigint: true });
      if (!before.isFile()) throw new Error('PIPELINE_INPUT_NOT_PHYSICAL');
      const bytes = fs.readFileSync(fd); observations.push({ file, fd, before, bytes });
      return bytes;
    } catch (error) { fs.closeSync(fd); throw error; }
  };
  const row = (relativePath: string, bytes: Buffer) => ({ relativePath, byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
  let declared: ReturnType<typeof capturePipelineV10DeclaredInputSet> | undefined;
  try {
    const rootBytes = read(path.join(authorRoot, 'pipeline.config.json'));
    const version: unknown = JSON.parse(rootBytes.toString('utf8')).schemaVersion;
    const rootMember = Object.freeze(row('config/pipeline.config.json', rootBytes));
    if (version === 'pipeline-entry.v10') {
      if (path.basename(authorRoot) !== 'config') throw new Error('PIPELINE_V10_SOURCE_LAYOUT_REQUIRED');
      const generationRoot = path.dirname(authorRoot), schemaName = 'schemas/pipeline-entry.schema.json';
      const schemaBytes = read(path.join(generationRoot, schemaName));
      declared = capturePipelineV10DeclaredInputSet(generationRoot, [rootMember, row(schemaName, schemaBytes)]);
      declared.capture.assertCurrent();
    }
    for (const o of observations) if (!unchanged(o.before, fs.fstatSync(o.fd, { bigint: true }))
      || !unchanged(o.before, fs.lstatSync(o.file, { bigint: true }))) throw new Error('PIPELINE_INPUT_CHANGED');
    return Object.freeze({ rootSchemaVersion: version, rootMember, declared, activationAllowed: false as const });
  } catch (error) { declared?.capture.close(); throw error; }
  finally { for (const o of observations) fs.closeSync(o.fd); }
}
