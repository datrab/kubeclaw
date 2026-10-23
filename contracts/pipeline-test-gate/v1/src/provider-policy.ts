import { remotePlanDigest } from './digest.ts';
import type { ProviderConfiguration, ProviderConfigurationV2, ProviderRefV1, TestMode, EvidencePolicyV1, ProviderRegistrationV1 } from './types.ts';

/** These digests identify the frozen reviewed receiving schemas, not an installed grant. */
export const QUALITY_OWNER_SCHEMA_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  'kubeclaw.coverage-budget@1': 'sha256:5fab2c8785e281c2154356f13d40b1bcf1c58bbacf7fbf7074e9ab82171ad626',
  'kubeclaw.size-budget@1': 'sha256:7c0491b2d5876e45f3377c12f389b4bca94a3fa31f8e006845f374b2a40d7bf3',
});
export const QUALITY_TASK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false });
export const QUALITY_TASK_SCHEMA_DIGEST = remotePlanDigest(QUALITY_TASK_SCHEMA);

/** Call after structural validation. No current file, registry or policy is loaded here. */
export function providerPolicyErrors(config: ProviderConfiguration, provider?: ProviderRefV1): string[] {
  if (config.schemaVersion === 'provider-configuration.v1') return [];
  const errors: string[] = [];
  const { binding, processing, declarations } = config.selectedPolicy;
  const packageId = config.contractId.slice(0, config.contractId.lastIndexOf('@'));
  const registrationId = packageId === 'kubeclaw.coverage-budget' ? `${packageId}:lcov` : `${packageId}:artifact`;
  if (binding.packageId !== packageId || binding.registrationId !== registrationId || binding.kind !== 'test-provider') {
    errors.push('/selectedPolicy/binding provider identity mismatch');
  }
  if (binding.taskSchemaDigest !== QUALITY_TASK_SCHEMA_DIGEST || config.taskSchemaDigest !== QUALITY_TASK_SCHEMA_DIGEST) {
    errors.push('/taskSchemaDigest does not identify the closed task-only schema');
  }
  if (binding.ownerSchemaDigest !== QUALITY_OWNER_SCHEMA_DIGESTS[config.contractId]) errors.push('/selectedPolicy/binding/ownerSchemaDigest mismatch');
  if (binding.profileDigest !== remotePlanDigest({ processing, declarations })) errors.push('/selectedPolicy/binding/profileDigest mismatch');
  if (provider && (provider.contractId !== config.contractId || provider.packageId !== binding.packageId
    || `${provider.packageId}:${provider.registrationId}` !== binding.registrationId || provider.packageVersion !== binding.packageVersion
    || provider.contentDigest !== binding.packageContentDigest)) errors.push('/selectedPolicy/binding original package mismatch');
  errors.push(...providerPolicyEvidenceErrors(config, declarations.evidenceDefaults));
  if (config.contractId === 'kubeclaw.size-budget@1') {
    const rules = processing.matchingFiles as Array<{ id: string }>;
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) errors.push('/selectedPolicy/processing/matchingFiles duplicate id');
  }
  return errors;
}

/** Manifest support is immutable; an owner can restrict it, never expand it. */
export function providerPolicySupportErrors(config: ProviderConfigurationV2, registration: ProviderRegistrationV1): string[] {
  const errors = providerPolicyErrors(config, { ...registration.package, registrationId: registration.registrationId, contractId: registration.contractId });
  const selected = config.selectedPolicy.declarations;
  if (selected.retrySafe && !registration.retrySafe) errors.push('/selectedPolicy/declarations/retrySafe exceeds package support');
  if (selected.matrixFields.some(field => !registration.matrixFields.includes(field))) errors.push('/selectedPolicy/declarations/matrixFields exceeds package support');
  for (const outcome of ['onPass', 'onFail', 'onError'] as const) {
    if (selected.evidenceDefaults[outcome].some(type => !registration.evidenceTypes.includes(type))) errors.push(`/selectedPolicy/declarations/evidenceDefaults/${outcome} exceeds package support`);
  }
  return errors;
}

/** Effective task overrides must retain mandatory produced/error evidence on restore too. */
export function providerPolicyEvidenceErrors(config: ProviderConfiguration, evidence: EvidencePolicyV1): string[] {
  if (config.schemaVersion !== 'provider-configuration.v2') return [];
  const supported = config.contractId === 'kubeclaw.size-budget@1' ? ['log', 'size-budget-baseline'] : ['log'];
  const errors: string[] = [];
  for (const outcome of ['onPass', 'onFail', 'onError'] as const) {
    if (!evidence[outcome].includes('log')) errors.push(`/evidence/${outcome} mandatory-log-evidence missing`);
    if (evidence[outcome].some(type => !supported.includes(type))) errors.push(`/evidence/${outcome} exceeds package support`);
  }
  if (config.contractId === 'kubeclaw.size-budget@1' && (!evidence.onPass.includes('size-budget-baseline')
    || !evidence.onFail.includes('size-budget-baseline') || !evidence.onError.includes('log'))) errors.push('/evidence mandatory-size-evidence missing');
  return errors;
}

/** Mode is carried by the resolved node, never guessed from the provider invocation. */
export function providerPolicyModeErrors(config: ProviderConfiguration, mode: TestMode | null): string[] {
  if (config.schemaVersion !== 'provider-configuration.v2' || config.contractId !== 'kubeclaw.size-budget@1' || mode !== 'blocking') return [];
  const processing = config.selectedPolicy.processing;
  return ['maximumTotalBytes', 'maximumFileCount', 'maximumGrowthBytes', 'maximumGrowthPercent'].every(key => processing[key] === null)
    && (processing.matchingFiles as unknown[]).length === 0 ? ['/mode blocking-size-limit-required'] : [];
}
