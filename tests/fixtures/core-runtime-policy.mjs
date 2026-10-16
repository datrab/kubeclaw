// Explicit former-behavior selection for original test fixtures, not a runtime default.
import { fileURLToPath } from 'node:url';
import { loadCoreRuntimePolicy } from '../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
export const TEST_CORE_POLICY_SELECTION = Object.freeze({ file: fileURLToPath(new URL('../../config/nova/core.config.json', import.meta.url)), profile: 'standard' });
// Preserve v1 fixture publications and legacy graph captures across the v2
// compiler cutover; selected compiler tests load the complete v2 owner directly.
const {policyVersion: _version, projectCompiler: _compiler, ...legacyPolicy} = loadCoreRuntimePolicy(TEST_CORE_POLICY_SELECTION);
const {payloadStructure: _structure, ...legacyPayload} = legacyPolicy.operatorMessagingPayload;
export const TEST_CORE_POLICY = Object.freeze({...legacyPolicy,operatorMessagingPayload:Object.freeze(legacyPayload)});
