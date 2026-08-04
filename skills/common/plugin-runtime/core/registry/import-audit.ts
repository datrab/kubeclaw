import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegistryError } from './errors.ts';

function auditFailureCause(result: Readonly<{ stderr: string; stdout: string; status: number | null }>): string {
  const stderr = result.stderr.trim();
  if (stderr) return stderr;
  const stdout = result.stdout.trim();
  if (stdout) return stdout;
  return `exit ${result.status}`;
}

interface AuditedEntry {
  readonly package: {
    readonly root: string;
    readonly manifest: { readonly id: string };
    readonly provenance: { readonly trustScope: string };
  };
  readonly registration: {
    readonly id: string;
    readonly module: string;
    readonly export: string;
  };
}

export function auditTrustedRegistrationImports(entries: readonly AuditedEntry[]): void {
  const modules = new Map<string, AuditedEntry>();
  for (const entry of entries) {
    if (entry.package.provenance.trustScope !== 'trusted_first_party') continue;
    const modulePath = path.join(entry.package.root, entry.registration.module);
    const key = `${modulePath}\u0000${entry.registration.export}`;
    if (!modules.has(key)) modules.set(key, entry);
  }
  const child = fileURLToPath(new URL('./import-audit-child.mjs', import.meta.url));
  for (const entry of modules.values()) {
    const modulePath = path.join(entry.package.root, entry.registration.module);
    const result = spawnSync(
      process.execPath,
      [
        '--permission',
        '--allow-fs-read=*',
        child,
        modulePath,
        entry.registration.export,
      ],
      {
        cwd: entry.package.root,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          NODE_PATH: process.env.NODE_PATH,
        },
        timeout: 30_000,
      },
    );
    const successMarker = `REGISTRY_IMPORT_AUDIT_OK:${entry.registration.export}`;
    if (
      result.status !== 0
      || !result.stdout.split(/\r?\n/u).includes(successMarker)
    ) {
      const cause = auditFailureCause(result);
      throw new RegistryError(
        cause.includes('REGISTRY_EXECUTOR_INVALID')
          ? 'REGISTRY_EXECUTOR_INVALID'
          : 'REGISTRY_IMPORT_SIDE_EFFECT',
        cause.includes('REGISTRY_EXECUTOR_INVALID')
          ? `Trusted registration export is invalid: ${entry.package.manifest.id}:${entry.registration.id}`
          : `Trusted registration import is not side-effect-free: ${entry.package.manifest.id}:${entry.registration.id}`,
        {
          pluginId: entry.package.manifest.id,
          registrationId: entry.registration.id,
          modulePath,
          cause,
        },
      );
    }
  }
}
