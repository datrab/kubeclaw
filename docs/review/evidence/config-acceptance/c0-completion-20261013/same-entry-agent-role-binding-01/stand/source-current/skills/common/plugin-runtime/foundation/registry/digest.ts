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

export function computePackageDigest(root: string): string {
  const hash = crypto.createHash('sha256');
  for (const relative of packageFiles(root).sort()) {
    const bytes = fs.readFileSync(path.join(root, relative));
    hash.update(Buffer.from(`${Buffer.byteLength(relative)}:${relative}:${bytes.byteLength}:`));
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}
