import { validateBusterReportPackageSnapshot, type BusterReportPackageSnapshotSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Explicit retained reader for unversioned/v2 original execution captures.
const LEGACY_PACKAGE_POLICY = Object.freeze({ maximumFiles: 2_048, maximumBytes: 64 * 1024 * 1024, timeoutMs: 30_000 });

async function readPackageFile(source: string, maximumBytes: number, check: () => void): Promise<Buffer> {
  const handle = await fs.promises.open(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximumBytes) {
      throw new Error('REPORT_ADAPTER_PACKAGE_BYTE_LIMIT');
    }
    const content = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < content.byteLength) {
      check();
      const { bytesRead } = await handle.read(content, offset, content.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error('REPORT_ADAPTER_PACKAGE_CHANGED');
    return content.subarray(0, offset);
  } finally { await handle.close(); }
}

interface PackageFile {
  readonly relative: string;
  readonly bytes: Buffer;
}

export async function readPackage(root: string, signal?: AbortSignal, selectedPolicy?: BusterReportPackageSnapshotSettings): Promise<{ digest: string; files: PackageFile[] }> {
  const policy = selectedPolicy === undefined ? LEGACY_PACKAGE_POLICY : validateBusterReportPackageSnapshot(selectedPolicy);
  const started = Date.now();
  const files: PackageFile[] = [];
  let totalBytes = 0;
  const check = () => {
    if (signal?.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    if (Date.now() - started > policy.timeoutMs) throw new Error('REPORT_ADAPTER_PACKAGE_SNAPSHOT_TIMEOUT');
  };
  const visit = async (relative = ''): Promise<void> => {
    check();
    const directory = path.join(root, relative);
    const entries = (await fs.promises.readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      check();
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`REPORT_ADAPTER_PACKAGE_SYMLINK:${child}`);
      if (entry.isDirectory()) { await visit(child); continue; }
      if (!entry.isFile()) throw new Error(`REPORT_ADAPTER_PACKAGE_ENTRY_INVALID:${child}`);
      if (files.length >= policy.maximumFiles) throw new Error('REPORT_ADAPTER_PACKAGE_FILE_LIMIT');
      const bytes = await readPackageFile(path.join(root, child), policy.maximumBytes - totalBytes, check);
      totalBytes += bytes.byteLength;
      files.push({ relative: child, bytes });
    }
  };
  await visit();
  files.sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0);
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(Buffer.from(`${Buffer.byteLength(file.relative)}:${file.relative}:${file.bytes.byteLength}:`));
    hash.update(file.bytes);
  }
  return { digest: `sha256:${hash.digest('hex')}`, files };
}

export async function writePackageSnapshot(destination: string, files: readonly PackageFile[], signal?: AbortSignal, selectedPolicy?: BusterReportPackageSnapshotSettings): Promise<void> {
  const policy = selectedPolicy === undefined ? LEGACY_PACKAGE_POLICY : validateBusterReportPackageSnapshot(selectedPolicy);
  const started = Date.now();
  await fs.promises.mkdir(destination, { mode: 0o700 });
  for (const file of files) {
    if (signal?.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    if (Date.now() - started > policy.timeoutMs) throw new Error('REPORT_ADAPTER_PACKAGE_SNAPSHOT_TIMEOUT');
    const target = path.join(destination, file.relative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(target, file.bytes, { flag: 'wx', mode: 0o600 });
  }
}

