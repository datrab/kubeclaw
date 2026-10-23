import { profile, strings, filePath } from './baseline-checksums.ts';
import { createHash } from 'node:crypto';
import { validatePrism } from './index.ts';
import { BASELINE_V1, BASELINE_V2, BASELINE_CHECKSUM_ENCODING, baselineChecksumText, assertBaselineChecksumDocument, type BaselineProfile } from './baseline-checksums.ts';
export { BASELINE_V1, BASELINE_V2, BASELINE_CHECKSUM_ENCODING, baselineChecksumText, assertBaselineChecksumDocument, type BaselineProfile } from './baseline-checksums.ts';
const hash = (value: string | Uint8Array): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export function baselineChecksumDigest(files: Readonly<Record<string, string>>, selected: BaselineProfile): string {
  return hash(baselineChecksumText(files, selected));
}

/** Real Control publication and importer share this owning assembly/digest contract. */
export function assembleBaselineArchive(input: {
  readonly profile: BaselineProfile;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly textFiles: Readonly<Record<string, string>>;
  readonly binaryFiles: Readonly<Record<string, string>>;
}) {
  profile(input.profile);
  const fields = ['bundleId', 'projectId', 'revision', 'designDocument', 'designSpecification', 'acceptanceCriteria', 'assets', 'previews', 'createdAt'];
  if (Object.keys(input.manifest).some(key => !fields.includes(key))) throw new Error('PRISM_ARCHIVE_MANIFEST_MISMATCH');
  const text = strings(input.textFiles), binary = strings(input.binaryFiles);
  const names = [...text, ...binary].map(([name]) => name);
  if (names.length + 2 > 4096 || new Set(names).size !== names.length
    || names.includes('manifest.json') || names.includes('checksums.json')) throw new Error('PRISM_ARCHIVE_FILE_SET_INVALID');
  const checksums: Record<string, string> = {};
  for (const [name, value] of text) { filePath(name); Object.defineProperty(checksums, name, { value: hash(value), enumerable: true, configurable: true }); }
  for (const [name, value] of binary) {
    filePath(name);
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value) throw new Error('PRISM_ARCHIVE_ENCODING_INVALID');
    Object.defineProperty(checksums, name, { value: hash(bytes), enumerable: true, configurable: true });
  }
  const bundleDigest = baselineChecksumDigest(checksums, input.profile);
  // Preserve the exact original Control manifest field order for v1 archive bytes.
  const manifest = { schema: input.profile === BASELINE_V1 ? 'prism.baseline-bundle.v1' : 'prism.baseline-bundle.v2',
    ...Object.fromEntries(fields.map(key => [key, input.manifest[key]])),
    ...(input.profile === BASELINE_V2 ? { checksumEncoding: BASELINE_CHECKSUM_ENCODING } : {}), digest: bundleDigest };
  validatePrism('baselineManifest', manifest);
  const checksumText = baselineChecksumText(checksums, input.profile);
  const textFiles: Record<string, string> = { ...input.textFiles,
    'checksums.json': input.profile === BASELINE_V1 ? JSON.stringify({ algorithm: 'sha256', files: JSON.parse(checksumText) }) : checksumText,
    'manifest.json': JSON.stringify(manifest) };
  const binaryFiles = { ...input.binaryFiles };
  const archive = { schema: input.profile, manifest, textFiles, binaryFiles };
  const bytes = Buffer.from(JSON.stringify(archive));
  return { archive, manifest, checksums, bundleDigest, bytes };
}
