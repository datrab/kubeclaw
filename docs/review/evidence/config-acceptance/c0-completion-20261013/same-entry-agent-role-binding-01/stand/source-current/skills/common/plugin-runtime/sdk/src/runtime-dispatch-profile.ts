import { CURRENT_RUNTIME_DISPATCH_PROFILE, type RuntimeDispatchProfile } from './generated/contracts.ts';
import { portableJson } from './values.ts';
import type { CapabilityInvocation } from './runtime.ts';

const PROFILE_BYTES = portableJson(CURRENT_RUNTIME_DISPATCH_PROFILE);

/** Exact finite canonical contract, generated from the owning schema, not a fallback codec. */
export function parseRuntimeDispatchProfile(value: unknown): RuntimeDispatchProfile {
  if (portableJson(value) !== PROFILE_BYTES) throw new Error('RUNTIME_DISPATCH_PROFILE_INVALID');
  return CURRENT_RUNTIME_DISPATCH_PROFILE;
}

/** Producers select the frozen run profile before effect admission. Historical absence is unchanged. */
export function withRuntimeDispatchProfile(
  request: CapabilityInvocation, profile?: RuntimeDispatchProfile,
): CapabilityInvocation {
  if (profile === undefined) return request;
  const selected = parseRuntimeDispatchProfile(profile);
  portableJson(request);
  if (Object.hasOwn(request, 'runtimeDispatchProfile')) throw new Error('RUNTIME_DISPATCH_PROFILE_ALREADY_BOUND');
  return Object.freeze({ ...request, runtimeDispatchProfile: selected });
}

/** Only closed invocation metadata is control. An identically named model key is ordinary data. */
export function runtimeDispatchProfileFields(request: object, capability?: string): Readonly<{ runtimeDispatchProfile?: RuntimeDispatchProfile }> {
  portableJson(request);
  if (!Object.hasOwn(request, 'runtimeDispatchProfile')) return {};
  if (capability !== undefined && capability !== 'runtime.dispatch') throw new Error('RUNTIME_DISPATCH_PROFILE_CAPABILITY_INVALID');
  return { runtimeDispatchProfile: parseRuntimeDispatchProfile((request as CapabilityInvocation).runtimeDispatchProfile) };
}
