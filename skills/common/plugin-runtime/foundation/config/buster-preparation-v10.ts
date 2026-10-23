import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type { BusterPreparationSettings } from './swarm.ts';

/** Complete original v10 author, never an adapter to the legacy native wire.
 * Source coherence is not installation, caller, grant or output authority.
 */
export interface BusterPreparationV10Settings extends BusterPreparationSettings {
  readonly attemptEvidenceBytes: number;
  readonly attemptEvidenceFiles: number;
  readonly attemptLogBytes: number;
  readonly completionPhaseAllowance: number;
  readonly storeLockWaitSeconds: number;
  readonly tarDiagnosticCodeUnits: number;
  readonly resultInputReserveMultiplier: number;
}
interface Validator { (value: unknown): boolean; errors?: unknown[] | null }
const Constructor = Ajv2020 as unknown as new (options: object) => { compile(schema: object): Validator };
// Reuse the original complete versioned schema without pruning its required
// authors or relaxing the closed legacy preparation receiver.
const owners = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-owner-schemas.json', import.meta.url), 'utf8'));
const schema = owners.components['buster-engine'].properties.profiles.additionalProperties.properties.settings.properties.preparation;
const validate = new Constructor({ strict: true, allErrors: true }).compile(schema);

export function captureBusterPreparationV10(value: unknown): BusterPreparationV10Settings {
  if (!validate(value)) throw new Error(`BUSTER_PREPARATION_V10_INVALID:${JSON.stringify(validate.errors)}`);
  const settings = value as BusterPreparationV10Settings;
  const scalars = Object.values(settings).filter(item => typeof item === 'number');
  if (![...scalars, ...Object.values(settings.resourcePolicy)].every(Number.isSafeInteger)) {
    throw new Error('BUSTER_PREPARATION_V10_INTEGER_INVALID');
  }
  const completionWindow = settings.timeoutMs + settings.completionPhaseAllowance * settings.cleanupTimeoutMs;
  if (!Number.isSafeInteger(completionWindow) || completionWindow > 2_147_483_647) {
    throw new Error('BUSTER_PREPARATION_V10_COMPLETION_BUDGET_INVALID');
  }

  for (const bytes of [settings.maximumRequestBytes, settings.maximumArchiveBytes, settings.maximumHeaderBytes,
    settings.maximumInputBytes, settings.maximumOutputBytes, settings.maximumResultBytes]) {
    if (bytes > 2_147_483_647) throw new Error('BUSTER_PREPARATION_V10_BUFFER_LIMIT_INVALID');
  }
  const resultReserve = settings.resultInputReserveMultiplier * settings.maximumInputBytes;
  const outputReserve = settings.maximumResultBytes + resultReserve;
  const headerReserve = settings.maximumHeaderBytes + resultReserve;
  if (![resultReserve, outputReserve, headerReserve].every(Number.isSafeInteger)
    || settings.maximumArchiveBytes > settings.maximumRequestBytes
    || settings.maximumHeaderBytes >= settings.maximumMetadataBytes
    || settings.maximumInputBytes > settings.maximumJournalBytes
    || outputReserve > settings.maximumOutputBytes
    || headerReserve > settings.maximumResultBytes
    || settings.maximumOutputBytes > settings.maximumJournalBytes) {
    throw new Error('BUSTER_PREPARATION_V10_STORAGE_BUDGET_INVALID');
  }
  // Preserve the actual staged/extracted source accounting: seven fixed
  // filesystem entries, not completionPhaseAllowance (a different unit).
  const entries = settings.maximumArchiveEntries + 7;
  const sourceReserve = settings.maximumRequestBytes + settings.maximumArchiveBytes + settings.maximumExtractedBytes
    + settings.maximumHeaderBytes + entries * settings.sourceEntryReservationBytes;
  if (!Number.isSafeInteger(entries) || !Number.isSafeInteger(sourceReserve)
    || sourceReserve > settings.maximumSourceBytes || entries > settings.maximumSourceEntries) {
    throw new Error('BUSTER_PREPARATION_V10_SOURCE_RESERVATION_INVALID');
  }
  if (settings.closeTimeoutMs <= settings.drainTimeoutMs) throw new Error('BUSTER_PREPARATION_V10_CLOSE_BUDGET_INVALID');
  return Object.freeze({ ...settings, resourcePolicy: Object.freeze({ ...settings.resourcePolicy }) });
}
