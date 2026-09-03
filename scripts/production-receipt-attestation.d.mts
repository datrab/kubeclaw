import type { KeyObject } from 'node:crypto';

export interface ProductionReceiptAttestation {
  readonly schemaVersion: 'production-receipt-attestation.v1';
  readonly algorithm: 'ed25519';
  readonly authority: string;
  readonly publicKeyFingerprint: string;
  readonly signature: string;
}

export function canonicalJson(value: unknown): string;
export function attestProductionReceipt<T extends Readonly<Record<string, unknown>>>(
  value: T,
  privateKey: string | Buffer | KeyObject,
  authority?: string,
): T & { readonly attestation: ProductionReceiptAttestation };
export function verifyProductionReceipt(
  value: unknown,
  publicKey: string | Buffer | KeyObject,
  options?: { readonly expectedAuthority?: string; readonly expectedRevision?: string;
    readonly expectedBusterRevision?: string },
): string[];
