import { validatePrism } from '@kubeclaw/prism-contracts-v1';
import { BASELINE_V1, BASELINE_V2, BASELINE_CHECKSUM_ENCODING, baselineChecksumDigest, assertBaselineChecksumDocument } from '@kubeclaw/prism-contracts-v1/baseline-archive';
import { sha256Bytes, sha256Text } from '@kubeclaw/plugin-sdk';

const digest = (bytes: string | Buffer) => typeof bytes === 'string' ? sha256Text(bytes) : sha256Bytes(bytes);
const maximumBytes = 32 * 1024 * 1024;
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PRISM_ARCHIVE_OBJECT_INVALID');
  return value as Record<string, any>;
}
function filePath(value: string): void {
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0')
    || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('PRISM_ARCHIVE_PATH_INVALID');
}
function base64(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(maximumBytes / 3) * 4) throw new Error('PRISM_ARCHIVE_SIZE_EXCEEDED');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maximumBytes || bytes.toString('base64') !== value) throw new Error('PRISM_ARCHIVE_ENCODING_INVALID');
  return bytes;
}

/** Verify the actual content-addressed archive before publishing a Nova handoff. */
export function verifyBaselineArchive(response: unknown, approvedDigest: string, projectId: string) {
  const result = object(response);
  if (result.bundleDigest !== approvedDigest) throw new Error('PRISM_DESIGN_APPROVED_BUNDLE_MISMATCH');
  const bytes = base64(result.archiveBase64);
  if (result.artifactId !== `artifact:${digest(bytes)}`) throw new Error('PRISM_ARCHIVE_DIGEST_MISMATCH');
  const archive = object(JSON.parse(bytes.toString('utf8')));
  if (archive.schema !== BASELINE_V1 && archive.schema !== BASELINE_V2) throw new Error('PRISM_ARCHIVE_SCHEMA_INVALID');
  const manifest = object(archive.manifest);
  const manifestSchema = archive.schema === BASELINE_V1 ? 'prism.baseline-bundle.v1' : 'prism.baseline-bundle.v2';
  if (manifest.schema !== manifestSchema || manifest.digest !== approvedDigest || manifest.projectId !== projectId
    || (archive.schema === BASELINE_V2 && manifest.checksumEncoding !== BASELINE_CHECKSUM_ENCODING)) throw new Error('PRISM_ARCHIVE_MANIFEST_MISMATCH');
  validatePrism('baselineManifest', manifest);
  const textFiles = object(archive.textFiles);
  const binaryFiles = object(archive.binaryFiles);
  const names = [...Object.keys(textFiles), ...Object.keys(binaryFiles)];
  if (names.length > 4096 || new Set(names).size !== names.length) throw new Error('PRISM_ARCHIVE_FILE_SET_INVALID');
  const checksumDocument = object(JSON.parse(textFiles['checksums.json']));
  assertBaselineChecksumDocument(checksumDocument, archive.schema);
  const checksums = object(checksumDocument.files);
  const expected = names.filter(name => name !== 'manifest.json' && name !== 'checksums.json').sort();
  if (JSON.stringify(Object.keys(checksums).sort()) !== JSON.stringify(expected)) throw new Error('PRISM_ARCHIVE_CHECKSUM_SET_INVALID');
  let totalBytes = 0;
  for (const name of names) {
    filePath(name);
    const content = Object.hasOwn(textFiles, name) ? textFiles[name] : base64(binaryFiles[name]);
    if (typeof content !== 'string' && !Buffer.isBuffer(content)) throw new Error('PRISM_ARCHIVE_FILE_INVALID');
    totalBytes += Buffer.byteLength(content);
    if (totalBytes > maximumBytes) throw new Error('PRISM_ARCHIVE_SIZE_EXCEEDED');
    if (Object.hasOwn(checksums, name) && digest(content) !== checksums[name]) throw new Error(`PRISM_ARCHIVE_FILE_DIGEST_MISMATCH:${name}`);
  }
  if (baselineChecksumDigest(checksums, archive.schema) !== approvedDigest) throw new Error('PRISM_ARCHIVE_BUNDLE_DIGEST_MISMATCH');
  if (JSON.stringify(JSON.parse(textFiles['manifest.json'])) !== JSON.stringify(manifest)) throw new Error('PRISM_ARCHIVE_MANIFEST_MISMATCH');
  for (const key of ['designDocument', 'designSpecification', 'acceptanceCriteria', 'previews']) {
    const name = object(manifest[key]).path;
    if (typeof name !== 'string' || !Object.hasOwn(checksums, name)) throw new Error('PRISM_ARCHIVE_REQUIRED_FILE_MISSING');
  }
  for (const asset of Object.values(object(manifest.assets))) {
    const item = object(asset);
    if (typeof item.path !== 'string' || checksums[item.path] !== item.digest) throw new Error('PRISM_ARCHIVE_ASSET_MISMATCH');
  }
  const document = object(validatePrism('designDocument', JSON.parse(textFiles[manifest.designDocument.path])));
  if (document.meta.projectId !== projectId || document.meta.revision !== manifest.revision
    || manifest.designDocument.revision !== manifest.revision) throw new Error('PRISM_ARCHIVE_DOCUMENT_MISMATCH');
  validatePrism('acceptanceCriteria', JSON.parse(textFiles[manifest.acceptanceCriteria.path]));
  const previews = object(validatePrism('previewIndex', JSON.parse(textFiles[manifest.previews.path])));
  if (!previews.previews.length) throw new Error('PRISM_ARCHIVE_PREVIEWS_MISSING');
  for (const preview of previews.previews) {
    if (checksums[preview.path] !== preview.digest || checksums[preview.ariaPath] !== preview.ariaDigest
      || !document.views[preview.view]?.states[preview.state]) throw new Error('PRISM_ARCHIVE_PREVIEW_MISMATCH');
  }
  return { artifactId: result.artifactId as string, bundleDigest: approvedDigest, archive };
}
