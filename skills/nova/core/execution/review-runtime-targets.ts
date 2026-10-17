import {openClawTargetCapacity,openClawTargetIdentity} from '@kubeclaw/plugin-foundation/config/openclaw-target-capacity';
/** Derive budget metadata from the exact adapter configuration retained and used
 * for activation. Dispatch profile is an encoding contract, not model authority.
 * No independent config lookup and no expected-attestation value is a fallback. */
export function reviewRuntimeTarget(config: Readonly<Record<string,unknown>>, binding?: Readonly<{provider:string;configuration:Readonly<Record<string,unknown>>}>): Readonly<Record<string,unknown>> {
 if(!binding || binding.provider!=='kubeclaw.runtime-dispatch:openclaw')throw new Error('REVIEW_ACTIVATED_TARGET_UNSUPPORTED');
 const targets=binding.configuration.targets as Readonly<Record<string,unknown>>|undefined;
 const target=targets?.[typeof config.agent==='string'?config.agent.trim():''] as Readonly<Record<string,unknown>>|undefined;
 if(!target)throw new Error('REVIEW_ACTIVATED_TARGET_MISSING');
 // These identity fields describe the same actual target selected by resource id.
 const identity=openClawTargetIdentity(target);
 const text=(value:unknown,fallback='')=>typeof value==='string'?value.trim():fallback;
 if(text(config.reviewerModel)!==identity.model || (config.reviewerRuntime??'subagent')!==identity.runtime
  || text(config.reviewerAgentId,'codex')!==identity.agentId || text(config.reviewerThinking,'high')!==identity.thinking)throw new Error('REVIEW_ACTIVATED_TARGET_IDENTITY_MISMATCH');
 return openClawTargetCapacity(target);
}
export type ReviewRuntimeBinding=Parameters<typeof reviewRuntimeTarget>[1];
