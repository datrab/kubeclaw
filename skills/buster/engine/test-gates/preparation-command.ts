import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { preparationSourceDirectory } from './preparation-source.ts';

export interface PreparationCommandConfig {
  readonly launcher: string;
  readonly sourceRoot: string;
  readonly cgroupRoot: string;
  readonly tarExecutable: string;
  readonly trustedSourceAuthority: string;
  readonly sourceAttestationPublicKey: string;
}

/** Immutable image entrypoints, fixed identity and own-gate filesystem authority. */
export function preparationCommand(admissionId: string, settings: BusterPreparationSettings,
  config: PreparationCommandConfig, preparationUid: PreparationSlot, phase: 'prepare' | 'historical' | 'cleanup' = 'prepare') {
  assertPreparationSlot(preparationUid);
  const directory = preparationSourceDirectory(config.sourceRoot, admissionId);
  const gate = path.dirname(directory);
  const sandbox = fileURLToPath(new URL('../../../common/plugin-runtime/foundation/isolation/plugin-sandbox', import.meta.url));
  const hostFiles = { prepare: './preparation-host.ts', historical: './preparation-historical-host.ts',
    cleanup: './preparation-cleanup-host.ts' } as const;
  const host = fileURLToPath(new URL(hostFiles[phase], import.meta.url));
  const app = fileURLToPath(new URL('../../../../', import.meta.url));
  const readRoots = [app, '/usr', '/lib', '/lib64', '/etc/ssl', '/proc', config.cgroupRoot]
    .filter(root => fs.existsSync(root));
  if (!readRoots.includes(config.cgroupRoot)) throw new Error('BUSTER_PREPARATION_CGROUP_ROOT_MISSING');
  for (const root of readRoots) {
    const real = fs.realpathSync(root);
    if (real === config.sourceRoot || config.sourceRoot.startsWith(`${real}${path.sep}`)) {
      throw new Error('BUSTER_PREPARATION_SOURCE_ANCESTOR_READ_FORBIDDEN');
    }
  }
  return { launcher: config.launcher, uid: preparationUid, gid: preparationUid, executable: sandbox,
    arguments: [String(settings.resourcePolicy.memoryBytes), String(Math.max(1, Math.ceil(settings.resourcePolicy.cpuTimeMs / 1000))),
      String(settings.maximumOpenFiles), ...readRoots.flatMap(root => ['--read-root', root]),
      '--write-root', gate, process.execPath, host],
    cwd: gate,
    environment: {
      PATH: '/usr/local/bin:/usr/bin:/bin', HOME: gate, TMPDIR: gate, NODE_ENV: 'production',
      BUSTER_PREPARATION_ASSIGNED_INPUT_BYTES: String(settings.maximumInputBytes),
      BUSTER_PREPARATION_ASSIGNED_SOURCE_ROOT: config.sourceRoot,
      BUSTER_PREPARATION_ASSIGNED_TAR: config.tarExecutable,
      BUSTER_PREPARATION_ASSIGNED_SOURCE_AUTHORITY: config.trustedSourceAuthority,
      BUSTER_PREPARATION_ASSIGNED_SOURCE_PUBLIC_KEY: config.sourceAttestationPublicKey,
    },
  };
}
