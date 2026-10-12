import type { WaitRequest } from './generated/contracts.ts';

/** A reference to retained Core evidence, never an adapter-selected filesystem path. */
export interface RetainedWaitSource {
  readonly schemaVersion: 'retained-core-wait-source.v1';
  readonly runId: string;
  readonly runJournalHead: string;
  readonly snapshotDigest: string;
  readonly eventsPrefixBytes: number;
  readonly effectsPrefixBytes: number;
  readonly signalsPrefixBytes: number;
  readonly eventsDigest: string;
  readonly effectsDigest: string;
  readonly signalsDigest: string;
  readonly rootIdentityDigest: string;
  readonly effectKey: string;
  readonly waitId: string;
  readonly originalPayloadDigest: string;
  readonly inventoryLimits: Readonly<{
    maximumFiles: number;
    maximumTotalBytes: number;
    maximumSnapshotBytes: number;
  }>;
}

export type RetainedWaitResolver = (source: RetainedWaitSource) => WaitRequest;
