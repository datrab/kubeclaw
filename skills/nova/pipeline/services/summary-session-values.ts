import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from './discord-fields.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export function buildSummaryDiscordFields(identity: any = {}, extra: any = []) {
  return buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, identity, extra);
}

export function buildSummaryDiscordCorrelation(identity: any = {}) {
  return {
    run_id: selectTruthyValue(() => (identity.run_id), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (identity.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (identity.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (identity.session_key), () => (null)),
  };
}

export function requirePositiveSummaryTimeout(value: any, label: any) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}: required positive number in swarm.config.json`);
  }
  return value;
}
