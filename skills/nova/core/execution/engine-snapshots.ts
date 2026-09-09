import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT_RUNTIME_DISPATCH_PROFILE, parseRuntimeDispatchProfile, portableJson, type RuntimeDispatchProfile, type AdministrativeReopenDecision, type PipelineDefinition, type ResumeSignal } from '@kubeclaw/plugin-sdk';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { ExecutionGraph, type ExecutionGraphSnapshot } from './graph.ts';
import type { PreparedRuntime } from './engine-runtime.ts';

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested); return Object.freeze(value);
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function graphSnapshot(definition: PipelineDefinition, version?: ExecutionGraphSnapshot['schemaVersion']): ExecutionGraphSnapshot {
  return ExecutionGraph.fromDefinition(definition).snapshot(definition.id, definition.maxConcurrency, version);
}

interface PinnedPackage { readonly package: { readonly packageVersion: string; readonly contentDigest: string } }
type PackageUpgrade = NonNullable<Extract<AdministrativeReopenDecision, { continuation: 'retry' | 'cancel' }>['packageUpgrades']>[number];
export function recordedPackageUpgrades(decisions: readonly AdministrativeReopenDecision[]): readonly PackageUpgrade[] {
  return decisions.flatMap((decision) => decision.continuation === 'retry' ? decision.packageUpgrades ?? [] : []);
}
export function verifyPinnedPackages(runRoot: string, runtime: PreparedRuntime, upgrades: readonly PackageUpgrade[] = []): void {
  const stored = readRunSnapshot(runRoot).registry as unknown;
  if (!stored || typeof stored !== 'object' || (stored as Record<string, unknown>).dependencyIdentityVersion !== 'parent-invocation.v1') throw new Error('RECOVERY_DEPENDENCY_IDENTITY_MISMATCH:drain existing runs with their original runtime; automatic migration is unsupported');
  const packages = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as { packages?: unknown }).packages : undefined;
  if (!Array.isArray(packages)) throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  if (canonicalJson((stored as Record<string, unknown>).configuration) !== canonicalJson(runtime.configuration)) throw new Error('RECOVERY_RUNTIME_CONFIGURATION_MISMATCH');
  const pinned = new Map<string, PinnedPackage>(); packages.forEach((value) => addPinnedPackage(value, pinned));
  if (canonicalJson([...runtime.snapshot.packages.keys()].sort()) !== canonicalJson([...pinned.keys()].sort())) throw new Error('RECOVERY_PINNED_PACKAGE_SET_MISMATCH');
  for (const pluginId of new Set(upgrades.map(({ pluginId }) => pluginId))) {
    if (!pinned.has(pluginId)) throw new Error(`RECOVERY_PACKAGE_UPGRADE_UNKNOWN:${pluginId}`);
  }
  for (const [pluginId, provenance] of pinned) assertPinnedPackage(pluginId, provenance, runtime,
    upgrades.filter((upgrade) => upgrade.pluginId === pluginId));
}

function addPinnedPackage(value: unknown, pinned: Map<string, PinnedPackage>): void {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || pinned.has(value[0])) throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  const provenance = value[1] as { package?: { packageVersion?: unknown; contentDigest?: unknown } } | null;
  if (!provenance?.package || typeof provenance.package.packageVersion !== 'string' || typeof provenance.package.contentDigest !== 'string') throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  pinned.set(value[0], provenance as PinnedPackage);
}
function assertPinnedPackage(pluginId: string, provenance: PinnedPackage, runtime: PreparedRuntime, upgrades: readonly PackageUpgrade[]): void {
  const current = runtime.snapshot.packages.get(pluginId); if (!current) throw new Error(`RECOVERY_PINNED_PACKAGE_MISSING:${pluginId}`);
  let expected = { pluginId, apiVersion: current.provenance.package.apiVersion,
    packageVersion: provenance.package.packageVersion, contentDigest: provenance.package.contentDigest };
  for (const upgrade of upgrades) {
    if (canonicalJson(upgrade.from) !== canonicalJson(expected) || upgrade.pluginId !== pluginId
      || upgrade.to.pluginId !== pluginId || upgrade.to.apiVersion !== expected.apiVersion) {
      throw new Error(`RECOVERY_PACKAGE_UPGRADE_MISMATCH:${pluginId}`);
    }
    expected = upgrade.to;
  }
  if (upgrades.length > 0) {
    if (canonicalJson(current.provenance.package) !== canonicalJson(expected)) throw new Error(`RECOVERY_PACKAGE_UPGRADE_MISMATCH:${pluginId}`);
    return;
  }
  if (current.provenance.package.packageVersion !== provenance.package.packageVersion) throw new Error(`RECOVERY_PINNED_PACKAGE_VERSION_MISMATCH:${pluginId}`);
  if (current.provenance.package.contentDigest !== provenance.package.contentDigest) throw new Error(`RECOVERY_PINNED_PACKAGE_DIGEST_MISMATCH:${pluginId}`);
}

export function verifyPinnedGraph(runRoot: string, definition: PipelineDefinition): ExecutionGraphSnapshot {
  const stored = readRunSnapshot(runRoot).graph as ExecutionGraphSnapshot; const current = graphSnapshot(definition, stored.schemaVersion);
  if (!['execution-graph-snapshot.v2', 'execution-graph-snapshot.v3'].includes(stored.schemaVersion)) throw new Error('RECOVERY_GRAPH_SNAPSHOT_INVALID');
  if (stored.pipelineId !== current.pipelineId) throw new Error(`RECOVERY_PIPELINE_ID_MISMATCH:${stored.pipelineId}:${current.pipelineId}`);
  if (stored.digest !== current.digest) throw new Error(`RECOVERY_GRAPH_DIGEST_MISMATCH:${stored.digest}:${current.digest}`); return current;
}

interface RunSnapshotBase { readonly graph: ExecutionGraphSnapshot; readonly registry: Readonly<Record<string, unknown>>; readonly digest: string }
export type RunSnapshot = RunSnapshotBase & (
  { readonly schemaVersion: 'run-snapshot.v1' | 'run-snapshot.v2'; readonly runtimeDispatchProfile?: never }
  | { readonly schemaVersion: 'run-snapshot.v3'; readonly runtimeDispatchProfile: RuntimeDispatchProfile }
);
function snapshotDigest(value: unknown, version: RunSnapshot['schemaVersion']): string {
  if (!['run-snapshot.v1', 'run-snapshot.v2', 'run-snapshot.v3'].includes(version)) throw new Error('RUN_SNAPSHOT_VERSION_INVALID');
  return `sha256:${crypto.createHash('sha256').update(version === 'run-snapshot.v1' ? canonicalJson(value) : portableJson(value)).digest('hex')}`;
}
export function assertRunSnapshot(snapshot: RunSnapshot): void {
  const { digest, ...unsigned } = snapshot;
  if (!['run-snapshot.v1', 'run-snapshot.v2', 'run-snapshot.v3'].includes(snapshot.schemaVersion)
    || !['execution-graph-snapshot.v2', 'execution-graph-snapshot.v3'].includes(snapshot.graph?.schemaVersion)
    || digest !== snapshotDigest(unsigned, snapshot.schemaVersion)) throw new Error('RUN_SNAPSHOT_INTEGRITY_INVALID');
  if (snapshot.schemaVersion === 'run-snapshot.v3') parseRuntimeDispatchProfile(snapshot.runtimeDispatchProfile);
  else if (Object.hasOwn(snapshot, 'runtimeDispatchProfile')) throw new Error('RUN_SNAPSHOT_LEGACY_PROFILE_INVALID');
}
export function readRunSnapshot(runRoot: string): RunSnapshot {
  const snapshot = JSON.parse(fs.readFileSync(path.join(runRoot, 'run-snapshot.json'), 'utf8')) as RunSnapshot;
  assertRunSnapshot(snapshot);
  return snapshot;
}
export function writeRunSnapshots(runRoot: string, graph: ExecutionGraphSnapshot, registry: Readonly<Record<string, unknown>>): void {
  if (['run-snapshot.json', 'graph-snapshot.json', 'registry-snapshot.json'].some((name) => fs.existsSync(path.join(runRoot, name)))) throw new Error(`RUN_ALREADY_EXISTS:${runRoot}`);
  const unsigned = { schemaVersion: 'run-snapshot.v3' as const, graph, registry, runtimeDispatchProfile: CURRENT_RUNTIME_DISPATCH_PROFILE };
  const file = path.join(runRoot, 'run-snapshot.json');
  const temporary = path.join(runRoot, `.snapshot-${crypto.randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, JSON.stringify({ ...unsigned, digest: snapshotDigest(unsigned, unsigned.schemaVersion) })); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  try {
    // Atomic no-replace publication: readers can never see half a snapshot pair.
    fs.linkSync(temporary, file);
    const directory = fs.openSync(runRoot, 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally { fs.unlinkSync(temporary); }
}

export function frozenRegistryRecord(runtime: PreparedRuntime, definition: PipelineDefinition, graph: ExecutionGraphSnapshot): Readonly<Record<string, unknown>> {
  const registrations = {
    stages: [...runtime.snapshot.stages].map(([stageType, entry]) => ({ stageType, registration: entry.registration, provenance: entry.provenance })),
    observers: [...runtime.snapshot.observers].map(([registrationId, entry]) => ({ registrationId, registration: entry.registration, provenance: entry.provenance })),
    adapters: [...runtime.snapshot.adapters].map(([registrationId, entry]) => ({ registrationId, registration: entry.registration, provenance: entry.provenance })),
  };
  return Object.freeze({ effectAuditVersion: 'coordinator-mode.v1', dependencyIdentityVersion: 'parent-invocation.v1', configuration: runtime.configuration, apiVersion: runtime.snapshot.apiVersion, packages: [...runtime.snapshot.packages].map(([id, pkg]) => [id, pkg.provenance]), registrations,
    enabledRegistrations: [...runtime.granted.enabledRegistrations].sort(), grants: [...runtime.granted.grants],
    selectedProviders: [...runtime.granted.selectedProviders].map(([capability, entry]) => ({ capability, provider: entry.provenance })),
    executionGraph: { pipelineId: graph.pipelineId, digest: graph.digest }, configuredStages: definition.stages.map((stage) => {
      const owner = runtime.snapshot.stages.get(stage.type)!; return { stageId: stage.id, stageType: stage.type, owner: owner.provenance };
    }) });
}

export function validateSignal(wait: NonNullable<StageRuntimeState['wait']>, signal: ResumeSignal, waitCreatedAt: string): void {
  validateContractValue('resumeSignal', signal);
  if (signal.waitId !== wait.waitId) throw new Error(`WAIT_SIGNAL_MISMATCH:${signal.waitId}`);
  if (signal.signalType !== wait.signalType) throw new Error(`WAIT_SIGNAL_TYPE_MISMATCH:${signal.signalType}`);
  if (signal.issuer.type !== wait.authorizedIssuer.type || signal.issuer.id !== wait.authorizedIssuer.id) throw new Error(`WAIT_ISSUER_DENIED:${signal.issuer.type}:${signal.issuer.id}`);
  if (wait.expiresAt !== null && Date.now() >= Date.parse(wait.expiresAt)) throw new Error(`WAIT_EXPIRED:${wait.waitId}`);
  if (Date.parse(signal.issuedAt) < Date.parse(waitCreatedAt)) throw new Error(`WAIT_SIGNAL_STALE:${signal.signalId}`);
}
