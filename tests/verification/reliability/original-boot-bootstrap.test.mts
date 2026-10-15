import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadNativeNodePolicy, nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { busterOriginalHostLocators, resolveOriginalBusterBoot } from '../../../skills/buster/engine/test-gates/preparation-boot-bootstrap.ts';
import { assertOriginalBusterRecoveryContext } from '../../../skills/buster/engine/test-gates/preparation-boot-store.ts';
import type { BusterLifetimeDescriptor } from '../../../skills/common/plugin-runtime/foundation/config/buster-lifetime.mjs';

test('original bootstrap locators equal the real existing host-policy producer, not invented defaults', () => {
  // Pure source projection only. This does NOT run host provisioning, probe a
  // node/kernel, or assert that the source model is an installed host grant.
  const policy = loadNativeNodePolicy(fileURLToPath(new URL('../../../my-values/infra/native-worker-pools-ax41.yaml', import.meta.url)));
  const actual = nativePoolPolicy(policy, 'buster');
  for (const key of ['ownershipRoot', 'cgroupRoot', 'nodeIdentityFile', 'runtimeIdentityFile'] as const) {
    assert.equal(busterOriginalHostLocators[key], actual[key]);
  }
  assert.equal(Object.isFrozen(busterOriginalHostLocators), true);
});

test('bootstrap requires the genuine owning lifetime descriptor before any fixed host lookup', () => {
  let invoked = false;
  const fake = { descriptor: 9, assertCurrent() { invoked = true; }, close() {} } as BusterLifetimeDescriptor;
  assert.throws(() => resolveOriginalBusterBoot(fake), /VERIFIED_DESCRIPTOR_REQUIRED/);
  assert.equal(invoked, false, 'a caller-shaped object never runs as trusted bootstrap');
  assert.throws(() => assertOriginalBusterRecoveryContext({ schemaVersion: 'buster-original-native-recovery-context.v1',
    assertCurrent() { invoked = true; } }), /VERIFIED_RECOVERY_CONTEXT_REQUIRED/);
  assert.equal(invoked, false);
});
