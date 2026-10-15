// Explicit former-behavior selection for original test fixtures, not a runtime default.
import { fileURLToPath } from 'node:url';
import { loadCoreRuntimePolicy } from '../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
export const TEST_CORE_POLICY_SELECTION = Object.freeze({ file: fileURLToPath(new URL('../../config/nova/core.config.json', import.meta.url)), profile: 'standard' });
export const TEST_CORE_POLICY = loadCoreRuntimePolicy(TEST_CORE_POLICY_SELECTION);
