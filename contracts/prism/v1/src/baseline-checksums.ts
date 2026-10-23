export const BASELINE_V1 = 'prism.baseline-archive.v1';
export const BASELINE_V2 = 'prism.baseline-archive.v2';
export const BASELINE_CHECKSUM_ENCODING = 'kubeclaw-json.utf16.v1';
export type BaselineProfile = typeof BASELINE_V1 | typeof BASELINE_V2;

export function profile(value: BaselineProfile): void {
  if (value !== BASELINE_V1 && value !== BASELINE_V2) throw new Error('PRISM_ARCHIVE_SCHEMA_INVALID');
}
export function strings(value: Readonly<Record<string, string>>): [string, string][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('PRISM_ARCHIVE_OBJECT_INVALID');
  return Reflect.ownKeys(value).map(key => {
    const item = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !item?.enumerable || !Object.hasOwn(item, 'value')
      || typeof item.value !== 'string') throw new Error('PRISM_ARCHIVE_FILE_INVALID');
    return [key, item.value];
  });
}
export function filePath(name: string): void {
  if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0')
    || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('PRISM_ARCHIVE_PATH_INVALID');
}
function checksumEntries(files: Readonly<Record<string, string>>): [string, string][] {
  return strings(files).map(([name, digest]) => {
    filePath(name);
    if (name === 'manifest.json' || name === 'checksums.json' || !/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error('PRISM_ARCHIVE_CHECKSUM_SET_INVALID');
    return [name, digest];
  });
}

/** A closed string-map codec, not a replacement serializer for arbitrary JSON. */
export function baselineChecksumText(files: Readonly<Record<string, string>>, selected: BaselineProfile): string {
  profile(selected);
  const entries = checksumEntries(files);
  if (selected === BASELINE_V1) return JSON.stringify(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))));
  const map = `{${entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',')}}`;
  // Fixed fields and validated flat string values have the exact UTF-16 codec
  // representation, including integer-looking member names; no locale/normalization.
  return `{"algorithm":"sha256","encoding":"${BASELINE_CHECKSUM_ENCODING}","files":${map},"schema":"prism.baseline-checksums.v2"}`;
}
export function assertBaselineChecksumDocument(value: Record<string, unknown>, selected: BaselineProfile): void {
  profile(selected);
  if (value.algorithm !== 'sha256') throw new Error('PRISM_ARCHIVE_CHECKSUM_ALGORITHM_INVALID');
  if (selected === BASELINE_V2 && (value.schema !== 'prism.baseline-checksums.v2'
    || value.encoding !== BASELINE_CHECKSUM_ENCODING
    || Object.keys(value).sort().join(',') !== 'algorithm,encoding,files,schema')) throw new Error('PRISM_ARCHIVE_CHECKSUM_ENCODING_INVALID');
}

