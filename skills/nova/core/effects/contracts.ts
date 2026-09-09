import type { AttemptIdentity, EffectReceipt, EffectRequest, ResourceLock } from '@kubeclaw/plugin-sdk';
import type { DependencyIdentity } from './dependency-identity.ts';

export interface EffectInvocation {
  readonly dependencyIdentity?: DependencyIdentity;
  readonly idempotencyKey: string;
  readonly deliveryId?: string;
  readonly attempt: AttemptIdentity;
  readonly capability: string;
  readonly operation: string;
  readonly resource: { readonly type: string; readonly canonicalId: string };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EffectAuditSink {
  requested(request: EffectRequest): void;
  accepted(request: EffectRequest): void;
  completed(request: EffectRequest, receipt: EffectReceipt): void;
}

export interface EffectModeAuditSink {
  requested(request: EffectRequest, mode: 'durable' | 'confidential'): void;
  accepted(request: EffectRequest, mode: 'durable' | 'confidential'): void;
  completed(request: EffectRequest, receipt: EffectReceipt, mode: 'durable' | 'confidential'): void;
}

export interface EffectLockManager {
  acquire(resource: ResourceLock['resource'], ownerLeaseId: string, ttlMs: number): ResourceLock;
  renew(lockId: string, ownerLeaseId: string, ttlMs: number): ResourceLock;
  release(lockId: string, ownerLeaseId: string): ResourceLock;
  assertCurrent(lockId: string, ownerLeaseId: string): ResourceLock;
}
