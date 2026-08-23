import fs from 'node:fs';
import path from 'node:path';
import type { PipelineDefinition, ResumeSignal } from '@kubeclaw/plugin-sdk';
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
export function graphSnapshot(definition: PipelineDefinition): ExecutionGraphSnapshot {
  return ExecutionGraph.fromDefinition(definition).snapshot(definition.id, definition.maxConcurrency);
}

interface PinnedPackage { readonly package: { readonly packageVersion: string; readonly contentDigest: string } }
export function verifyPinnedPackages(runRoot: string, runtime: PreparedRuntime): void {
  const stored = JSON.parse(fs.readFileSync(path.join(runRoot, 'registry-snapshot.json'), 'utf8')) as unknown;
  const packages = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as { packages?: unknown }).packages : undefined;
  if (!Array.isArray(packages)) throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  const pinned = new Map<string, PinnedPackage>(); packages.forEach((value) => addPinnedPackage(value, pinned));
  if (canonicalJson([...runtime.snapshot.packages.keys()].sort()) !== canonicalJson([...pinned.keys()].sort())) throw new Error('RECOVERY_PINNED_PACKAGE_SET_MISMATCH');
  for (const [pluginId, provenance] of pinned) assertPinnedPackage(pluginId, provenance, runtime);
}

function addPinnedPackage(value: unknown, pinned: Map<string, PinnedPackage>): void {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || pinned.has(value[0])) throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  const provenance = value[1] as { package?: { packageVersion?: unknown; contentDigest?: unknown } } | null;
  if (!provenance?.package || typeof provenance.package.packageVersion !== 'string' || typeof provenance.package.contentDigest !== 'string') throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  pinned.set(value[0], provenance as PinnedPackage);
}
function assertPinnedPackage(pluginId: string, provenance: PinnedPackage, runtime: PreparedRuntime): void {
  const current = runtime.snapshot.packages.get(pluginId); if (!current) throw new Error(`RECOVERY_PINNED_PACKAGE_MISSING:${pluginId}`);
  if (current.provenance.package.packageVersion !== provenance.package.packageVersion) throw new Error(`RECOVERY_PINNED_PACKAGE_VERSION_MISMATCH:${pluginId}`);
  if (current.provenance.package.contentDigest !== provenance.package.contentDigest) throw new Error(`RECOVERY_PINNED_PACKAGE_DIGEST_MISMATCH:${pluginId}`);
}

export function verifyPinnedGraph(runRoot: string, definition: PipelineDefinition): ExecutionGraphSnapshot {
  const stored = JSON.parse(fs.readFileSync(path.join(runRoot, 'graph-snapshot.json'), 'utf8')) as ExecutionGraphSnapshot; const current = graphSnapshot(definition);
  if (stored.schemaVersion !== 'execution-graph-snapshot.v2') throw new Error('RECOVERY_GRAPH_SNAPSHOT_INVALID');
  if (stored.pipelineId !== current.pipelineId) throw new Error(`RECOVERY_PIPELINE_ID_MISMATCH:${stored.pipelineId}:${current.pipelineId}`);
  if (stored.digest !== current.digest) throw new Error(`RECOVERY_GRAPH_DIGEST_MISMATCH:${stored.digest}:${current.digest}`); return current;
}

export function writeRunSnapshots(runRoot: string, graph: ExecutionGraphSnapshot, registry: Readonly<Record<string, unknown>>): void {
  const files = [[path.join(runRoot, 'graph-snapshot.json'), graph], [path.join(runRoot, 'registry-snapshot.json'), registry]] as const;
  if (files.some(([file]) => fs.existsSync(file))) throw new Error(`RUN_ALREADY_EXISTS:${runRoot}`);
  const created: string[] = [];
  try { for (const [file, value] of files) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); created.push(file); } }
  catch (error) { for (const file of created.reverse()) { try { fs.unlinkSync(file); } catch { /* INTENTIONAL_NONCRITICAL(snapshot_rollback_failed): Preserve initialization failure. */ } } throw error; }
}

export function frozenRegistryRecord(runtime: PreparedRuntime, definition: PipelineDefinition, graph: ExecutionGraphSnapshot): Readonly<Record<string, unknown>> {
  const registrations = {
    stages: [...runtime.snapshot.stages].map(([stageType, entry]) => ({ stageType, registration: entry.registration, provenance: entry.provenance })),
    observers: [...runtime.snapshot.observers].map(([registrationId, entry]) => ({ registrationId, registration: entry.registration, provenance: entry.provenance })),
    adapters: [...runtime.snapshot.adapters].map(([registrationId, entry]) => ({ registrationId, registration: entry.registration, provenance: entry.provenance })),
  };
  return Object.freeze({ apiVersion: runtime.snapshot.apiVersion, packages: [...runtime.snapshot.packages].map(([id, pkg]) => [id, pkg.provenance]), registrations,
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
