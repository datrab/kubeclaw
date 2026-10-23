import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import type { BusterStagedAdmission } from './preparation-input.ts';

export interface PreparationStorageReservation {
  readonly bytes: number;
  readonly entries: number;
}

function reservation(payloadBytes: number, entries: number,
  settings: BusterPreparationSettings): PreparationStorageReservation {
  const bytes = payloadBytes + entries * settings.sourceEntryReservationBytes;
  if (!Number.isSafeInteger(bytes) || bytes < 1 || !Number.isSafeInteger(entries) || entries < 1) {
    throw new Error('BUSTER_PREPARATION_RESERVATION_INVALID');
  }
  return { bytes, entries };
}

/** Gate and its fixed marker exist before validation; no archive has been allocated. */
export function gateReservation(settings: BusterPreparationSettings): PreparationStorageReservation {
  return reservation(settings.maximumInputBytes, 2, settings);
}

/** Original wire and bounded metadata stay charged after the native staging host exits. */
export function stagedInputReservation(staged: BusterStagedAdmission,
  settings: BusterPreparationSettings): PreparationStorageReservation {
  if (staged.input.wireBytes > settings.maximumRequestBytes) throw new Error('BUSTER_REMOTE_REQUEST_SIZE_EXCEEDED');
  // gate, gate marker, data directory, exact request, input identity/header
  return reservation(staged.input.wireBytes + Buffer.byteLength(JSON.stringify(staged))
    + settings.maximumInputBytes, 5, settings);
}

/** This is an additional reservation; the separately retained input is not credited away. */
export function extractedSourceReservation(staged: BusterStagedAdmission,
  settings: BusterPreparationSettings): PreparationStorageReservation {
  if (staged.job.repositoryArchive.sizeBytes > settings.maximumArchiveBytes) {
    throw new Error('BUSTER_REMOTE_ARCHIVE_SIZE_EXCEEDED');
  }
  // gate, marker, data, owner, repository root, archive, source identity/header, archive descendants
  return reservation(staged.job.repositoryArchive.sizeBytes + settings.maximumExtractedBytes
    + settings.maximumHeaderBytes + settings.maximumInputBytes,
  settings.maximumArchiveEntries + 7, settings);
}
