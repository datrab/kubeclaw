import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RegistryError } from './errors.ts';

function packageFiles(root: string, relative = ''): string[] {
  const directory = path.join(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new RegistryError('REGISTRY_REFERENCE_FORBIDDEN', `Plugin packages cannot contain symlinks: ${child}`);
    }
    if (entry.isDirectory()) {
      return packageFiles(root, child);
    }
    return entry.isFile() ? [child] : [];
  });
}

function updatePackageDigest(hash: ReturnType<typeof crypto.createHash>, relative: string, bytes: Uint8Array): void {
  hash.update(Buffer.from(`${Buffer.byteLength(relative)}:${relative}:${bytes.byteLength}:`));
  hash.update(bytes);
}

/** Same existing codec over caller-retained bytes; no filesystem or trust inference. */
export function computePackageFileSetDigest(files: Iterable<Readonly<{ relative: string; bytes: Uint8Array }>>): string {
  const hash = crypto.createHash('sha256');
  for (const { relative, bytes } of [...files].sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0)) {
    updatePackageDigest(hash, relative, bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

export function computePackageDigest(root: string): string {
  const hash = crypto.createHash('sha256');
  for (const relative of packageFiles(root).sort()) updatePackageDigest(hash, relative, fs.readFileSync(path.join(root, relative)));
  return `sha256:${hash.digest('hex')}`;
}
