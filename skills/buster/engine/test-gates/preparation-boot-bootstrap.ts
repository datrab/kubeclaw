import { assertBusterLifetimeDescriptor, type BusterLifetimeDescriptor } from '@kubeclaw/plugin-foundation/config/buster-lifetime.mjs';
import { PreparationOriginalBootStore, originalActiveBootWireMaximumBytes } from './preparation-boot-store.ts';

/** Generated fixed native locators, NOT defaults or editable policies.
 * SOURCE-RECEIVING-CONTRACT.md native-host-profile-01:38 and the existing
 * nativePoolPolicy producer + Buster Chart mounts define this exact layout.
 */
export const busterOriginalHostLocators = Object.freeze({
  ownershipRoot: '/var/lib/kubeclaw/native/buster',
  cgroupRoot: '/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service/buster',
  nodeIdentityFile: '/etc/kubeclaw/native-node-id',
  runtimeIdentityFile: '/etc/kubeclaw/native-runtime-identity.json',
});

/** First read for the retained-original branch of the pre-shell coordinator.
 * No environment, pool-policy B, generated runtime, current generation or
 * caller-selected root is accepted. Missing A is denial, not initial boot.
 * This returns evidence/inert restoration only, never execution authority.
 */
export function resolveOriginalBusterBoot(lifetime: BusterLifetimeDescriptor) {
  assertBusterLifetimeDescriptor(lifetime);
  const bootstrap = new PreparationOriginalBootStore(busterOriginalHostLocators.ownershipRoot, lifetime,
    originalActiveBootWireMaximumBytes);
  const prior = bootstrap.readActive();
  const pool = prior.capsule.facts.native.pool;
  if (prior.capsule.facts.ownershipStore.file !== busterOriginalHostLocators.ownershipRoot
    || pool.ownershipRoot !== busterOriginalHostLocators.ownershipRoot
    || pool.cgroupRoot !== busterOriginalHostLocators.cgroupRoot
    || pool.nodeIdentityFile !== busterOriginalHostLocators.nodeIdentityFile
    || pool.runtimeIdentityFile !== busterOriginalHostLocators.runtimeIdentityFile) {
    throw new Error('BUSTER_ORIGINAL_BOOT_HOST_UNRESOLVED');
  }
  // Only AFTER original A is resolved can its original per-record ceiling be
  // used. Never borrow a setting from B to find/decode A's durable pointer.
  const original = new PreparationOriginalBootStore(busterOriginalHostLocators.ownershipRoot, lifetime,
    prior.capsule.facts.preparation.maximumOwnershipBytes);
  const context = original.recoveryContext();
  if (context.originalBoot.digest !== prior.originalBoot.digest || context.originalBoot.parentBootId !== prior.originalBoot.parentBootId) {
    throw new Error('BUSTER_ORIGINAL_BOOT_ACTIVE_MISMATCH');
  }
  return context;
}
