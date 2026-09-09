import { CURRENT_RUNTIME_DISPATCH_PROFILE, type RuntimeDispatchProfile } from './generated/contracts.ts';
import { portableJson } from './values.ts';

const PROFILE_BYTES = portableJson(CURRENT_RUNTIME_DISPATCH_PROFILE);

/** Exact finite canonical contract, generated from the owning schema, not a fallback codec. */
export function parseRuntimeDispatchProfile(value: unknown): RuntimeDispatchProfile {
  if (portableJson(value) !== PROFILE_BYTES) throw new Error('RUNTIME_DISPATCH_PROFILE_INVALID');
  return CURRENT_RUNTIME_DISPATCH_PROFILE;
}

/** Producers select the frozen run profile before effect admission. Historical absence is unchanged. */
export function withRuntimeDispatchProfile(
  payload: Readonly<Record<string, unknown>>, profile?: RuntimeDispatchProfile,
): Readonly<Record<string, unknown>> {
  if (profile === undefined) return payload;
  const selected = parseRuntimeDispatchProfile(profile);
  portableJson(payload);
  if (Object.hasOwn(payload, 'runtimeDispatchProfile')) throw new Error('RUNTIME_DISPATCH_PROFILE_ALREADY_BOUND');
  return Object.freeze({ ...payload, runtimeDispatchProfile: selected });
}

/** Both transports remove only this newly declared control; legacy model bytes stay untouched. */
export function extractRuntimeDispatchProfile(payload: Readonly<Record<string, unknown>>): Readonly<{
  payload: Readonly<Record<string, unknown>>; profile?: RuntimeDispatchProfile;
}> {
  if (!Object.hasOwn(payload, 'runtimeDispatchProfile')) return { payload };
  portableJson(payload);
  const profile = parseRuntimeDispatchProfile(payload.runtimeDispatchProfile);
  const { runtimeDispatchProfile: _profile, ...modelPayload } = payload;
  return { payload: modelPayload, profile };
}
