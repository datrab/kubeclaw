import { projectControlSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

/** Database credentials are captured once; ordinary upgrades cannot rotate them. */
export function prismDatabaseBootstrapConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env) {
  const settings = projectControlSettings(capture).control.databaseBootstrap;
  const required = (name: string): string => {
    const value = environment[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  return Object.freeze({ ...settings, adminUrl: required('ADMIN_DATABASE_URL'),
    passwords: Object.freeze({ migrator: required('PRISM_MIGRATOR_PASSWORD'), runtime: required('PRISM_RUNTIME_PASSWORD'), readonly: required('PRISM_READONLY_PASSWORD') }),
  });
}
