import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

const GIT = 'kubeclaw.git-workspace:git';
export type GitRuntimeBindings = PlatformConfig['adapters'];

/** Internal original snapshot receiving, not a new author or capability grant.
 * Restore the executable, identity, roots and process bounds together before
 * normal registry/schema/grant/source admission. Never refill from current B.
 */
export function captureGitRuntimeBindings(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy): GitRuntimeBindings {
  if (!Object.hasOwn(adapters, GIT)) return Object.freeze({});
  const original = adapters[GIT];
  if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('RECOVERY_GIT_CONFIGURATION_INVALID');
  const target = structuredClone(original) as Record<string, unknown>;
  for (const [key, value] of Object.entries(policy.gitWorkspaceFailure)) {
    if (!Object.hasOwn(target, key) || target[key] !== value) throw new Error('RECOVERY_GIT_POLICY_MISMATCH');
    delete target[key];
  }
  const strings = ['workspaceRoot', 'gitExecutable', 'authorName', 'authorEmail'];
  const bounds = {maxExecutionMs:3600000, maxOutputBytes:16777216, terminationGraceMs:60000};
  if (Object.keys(target).sort().join(',') !== [...strings, ...Object.keys(bounds), 'allowedRepositoryRoots'].sort().join(',')
    || strings.some(key => typeof target[key] !== 'string' || !target[key])
    || Object.entries(bounds).some(([key, max]) => !Number.isSafeInteger(target[key]) || (target[key] as number) < 1 || (target[key] as number) > max)
    || !Array.isArray(target.allowedRepositoryRoots) || !target.allowedRepositoryRoots.length
    || target.allowedRepositoryRoots.some(root => typeof root !== 'string' || !root)
    || new Set(target.allowedRepositoryRoots).size !== target.allowedRepositoryRoots.length) throw new Error('RECOVERY_GIT_CONFIGURATION_INVALID');
  Object.freeze(target.allowedRepositoryRoots);
  return Object.freeze({[GIT]: Object.freeze(target)});
}

export function restoreGitRuntimeBindings(adapters: PlatformConfig['adapters'], retained: GitRuntimeBindings): PlatformConfig['adapters'] {
  if (Object.keys(retained).some(id => id !== GIT)) throw new Error('RECOVERY_GIT_CONFIGURATION_INVALID');
  if (Object.hasOwn(adapters, GIT) !== Object.hasOwn(retained, GIT)) throw new Error('RECOVERY_GIT_REGISTRATION_MISMATCH');
  return Object.hasOwn(retained, GIT) ? {...adapters, [GIT]: structuredClone(retained[GIT]!)} : adapters;
}
