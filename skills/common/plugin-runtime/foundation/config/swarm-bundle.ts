import { parseDocument } from 'yaml';
import { captureCorpusRanking } from './corpus-ranking.ts';
import { validateWorkerCoreV3Author } from './worker-core-policy.ts';
import { inspectPipelineV10PackageSource } from './pipeline-v10-package-source.ts';
import { preflightPipelineV10Infrastructure } from './pipeline-v10-infra.ts';
import { validatePipelineV10PluginRelations } from './pipeline-v10-plugin-relations.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { portableJson } from '@kubeclaw/plugin-sdk/values';
import { readBusterRemotePlanServicePolicy } from './buster-service-policy.ts';

const owners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'] as const;
type Owner = typeof owners[number];
interface Validator { (value: unknown): boolean; errors?: unknown[] | null }
const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => {
  compile(schema: object): Validator;
};
const ajv = new AjvConstructor({ allErrors: true, strict: true });
const readerAssetNames = ['pipeline-v10-receiver.ts', 'pipeline-v10-receiver-schemas.json', 'pipeline-v10-input-set.ts', 'pipeline-v10-input-contract.json', 'pipeline-v10-package-source.ts', 'pipeline-v10-package-sources.json', 'registry-digest.ts', 'registry-errors.ts', 'browser-native-profile.ts', 'browser-native-profile-sources.json', 'gateway-native-duration.ts', 'gateway-native-duration-sources.json', 'parse-duration-DBWI377R.mjs', 'string-coerce-CIXf7egm.mjs', 'provisioning-task-reference.ts', 'provisioning-task-reference.schema.json', 'pipeline-v10-recovery.ts', 'pipeline-v10-gateway.ts', 'pipeline-v10-gateway-sources.json', 'pipeline-v10-infra.ts', 'pipeline-v10-infra-schemas.json', 'swarm.schema.json', 'swarm-components.schema.json', 'worker-core-policy.ts', 'worker-core-v3.schema.json', 'corpus-ranking.ts', 'pipeline-v10-owner-schemas.json', 'pipeline-v10-plugin-schemas.json', 'pipeline-v10-plugin-relations.ts', 'pipeline-v10-source-relations.json', 'swarm-bundle.ts', 'swarm.ts',
  'buster-cluster-invokers.ts', 'buster-execution.ts', 'buster-service-policy.ts', 'buster-service-policy.schema.json', 'pipeline-generation.ts', 'pipeline-input-set.ts', 'pipeline-boot.mjs',
  'runtime-bundle-receipt.mjs', 'buster-startup.ts', 'buster-startup-file.mjs', 'buster-lifetime.mjs', 'pipeline-composition.ts', 'sdk-values.ts'] as const;
export const swarmReaderAssetLocations = Object.freeze(Object.fromEntries(readerAssetNames.map(name =>
  [name, name === 'registry-digest.ts' ? new URL('../registry/digest.ts', import.meta.url).href : name === 'registry-errors.ts' ? new URL('../registry/errors.ts', import.meta.url).href : name === 'sdk-values.ts' ? import.meta.resolve('@kubeclaw/plugin-sdk/values') : new URL(name, import.meta.url).href])) as Record<typeof readerAssetNames[number], string>);
const readerAssetBytes = new Map(readerAssetNames.map(name => [name, fs.readFileSync(new URL(swarmReaderAssetLocations[name]))]));
export const swarmReaderAssets = Object.freeze(readerAssetNames.map(name => {
  const bytes = readerAssetBytes.get(name)!;
  return Object.freeze({ name, byteLength: bytes.byteLength, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
}));
const entrySchema = JSON.parse(readerAssetBytes.get('swarm.schema.json')!.toString('utf8')) as object;
const componentSchema = JSON.parse(readerAssetBytes.get('swarm-components.schema.json')!.toString('utf8')) as {
  $defs: Record<string, object>;
};
const validateEntry = ajv.compile(entrySchema);
const validateComponent = ajv.compile(componentSchema);
let v10Validators: { root: Validator; components: Record<Owner, Validator> } | undefined;

function requirePipelineV10Root(document: unknown) {
  if (!v10Validators) {
    const schemas = JSON.parse(readerAssetBytes.get('pipeline-v10-owner-schemas.json')!.toString('utf8')) as {
      root: object; components: Record<Owner, object>;
    };
    v10Validators = { root: new AjvConstructor({ allErrors: true, strict: true }).compile(schemas.root),
      components: Object.fromEntries(owners.map(owner => [owner,
        new AjvConstructor({ allErrors: true, strict: true }).compile(schemas.components[owner])])) as Record<Owner, Validator> };
  }
  if (!v10Validators.root(document)) throw new Error(`PIPELINE_V10_ROOT_INVALID:${JSON.stringify(v10Validators.root.errors)}`);
  return v10Validators.components;
}

/** Local structural phase only. A successful result is deliberately NOT a
 * Swarm capture, original caller authorization or v10 activation permission.
 * Source/plugin/infra/native receiving remains mandatory in the complete path.
 */
export function preflightPipelineV10Owners(document: unknown, supplied: unknown) {
  const validators = requirePipelineV10Root(document);
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)
    || Object.keys(supplied).sort().join(',') !== [...owners].sort().join(',')) throw new Error('PIPELINE_V10_OWNER_SET_REQUIRED');
  const authors = supplied as Record<Owner, { profiles: Record<string, { settings: Record<string, unknown> }> }>;
  const counts: Partial<Record<Owner, number>> = {};
  for (const owner of owners) {
    const validator = validators[owner];
    if (!validator(authors[owner])) throw new Error(`PIPELINE_V10_OWNER_INVALID:${owner}:${JSON.stringify(validator.errors)}`);
    counts[owner] = Object.keys(authors[owner].profiles).length;
    if (owner === 'buster-engine') {
      for (const profile of Object.values(authors[owner].profiles)) readBusterRemotePlanServicePolicy(profile.settings.remotePlanService);
    }
  }
  const root = document as { bindings: Binding[]; pluginSelections: Record<string, string>[];
    engineSelections: Record<string, string>[]; deploymentSelections: Record<string, string>[];
    infrastructureSelections: Record<string, string>[] };
  const unique = (rows: readonly unknown[], key: (row: any) => unknown[]) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const value = JSON.stringify(key(row));
      if (seen.has(value)) throw new Error('PIPELINE_V10_DUPLICATE_SELECTION');
      seen.add(value);
    }
  };
  unique(root.bindings, row => [row.role, row.owner, row.instanceId]);
  unique(root.pluginSelections, row => [row.kind, row.registrationId, row.serviceInstanceId]);
  unique(root.engineSelections, row => [row.role, row.engineInstanceId, row.serviceInstanceId]);
  unique(root.deploymentSelections, row => [row.role, row.deploymentInstanceId, row.consumer, row.serviceInstanceId]);
  unique(root.infrastructureSelections, row => [row.role, row.deploymentInstanceId]);
  for (const binding of root.bindings) {
    if ((binding.owner.startsWith('prism-') && binding.role !== 'prism')
      || (binding.owner === 'buster-engine' && binding.role !== 'buster')) throw new Error('PIPELINE_V10_OWNER_ROLE_MISMATCH');
    if (!Object.hasOwn(authors[binding.owner].profiles, binding.profileId)) throw new Error('PIPELINE_V10_PROFILE_REQUIRED');
  }
  return Object.freeze({ schemaVersion: 'pipeline-entry.v10' as const,
    ownerProfileCounts: Object.freeze(counts), activationAllowed: false as const });
}
const settingsDefinitionNames = ['buster-preparation', 'buster-admission', 'buster-dependency-readiness',
  'buster-runtime-security', 'buster-cluster-invokers', 'buster-execution', 'buster-execution-observation', 'buster-provider-runtime', 'buster-execution-reports', 'buster-execution-processInput'] as const;
const settingsValidators = new Map(settingsDefinitionNames.map(name => [name, ajv.compile({
  $defs: componentSchema.$defs, $ref: name === 'buster-runtime-security'
    ? '#/$defs/buster-cluster-invokers/properties/runtimeSecurity' : `#/$defs/${name}`,
})]));
interface Component {
  readonly schemaVersion: 'pipeline-component.v2' | 'pipeline-component.v3';
  readonly owner: Owner;
  readonly settings: Readonly<Record<string, unknown>>;
}
interface ComponentAuthor {
  readonly schemaVersion: 'pipeline-component.v2' | 'pipeline-component.v3';
  readonly owner: Owner;
  readonly profiles: Readonly<Record<string, Readonly<{ settings: Readonly<Record<string, unknown>> }>>>;
}
export interface SwarmSelection {
  readonly role: 'nova' | 'buster' | 'prism';
  readonly serviceInstanceId: string;
  readonly callerId: 'prism-control' | 'prism-worker' | 'prism-studio' | 'prism-ingestion' | 'prism-agent-bridge' | 'buster-preparation' | 'buster-runtime';
  readonly bindings: readonly Readonly<{ owner: Owner; instanceId: string; profileId: string }>[];
}
interface Binding {
  readonly role: SwarmSelection['role'];
  readonly instanceId: string;
  readonly owner: Owner;
  readonly profileId: string;
}
const consumedOwners = {
  'prism-control': ['prism-control', 'prism-execution'],
  'prism-worker': ['prism-worker', 'prism-control', 'prism-execution'],
  'prism-studio': ['prism-studio'],
  'prism-ingestion': ['prism-control'],
  'prism-agent-bridge': ['prism-control'],
  'buster-preparation': ['buster-engine'],
  'buster-runtime': ['buster-engine', 'worker-core'],
} as const satisfies Record<SwarmSelection['callerId'], readonly Owner[]>;
interface Observation {
  readonly file: string;
  readonly fd: number;
  readonly before: fs.BigIntStats;
  readonly sha256: string;
  readonly byteLength: number;
}
interface V10PluginSelection {
  kind: string; packageId: string; registrationId: string; instanceId: string;
  ownerPath: string; profileId: string; serviceInstanceId: string;
}
interface V10PluginSource {
  ownerPath: string; manifestPath: string; family: 'provider' | 'nova-module';
  schema: object; manifest: Record<string, unknown>;
}
let v10Plugins: { packages: Record<string, V10PluginSource>;
  registrations: { packageId: string; registrationId: string; kind: string; family: string }[] } | undefined;
const v10PluginValidators = new Map<string, Validator>();

/** Mandatory LOCAL source-identity phase, never an installed grant. No plugin
 * module is imported/executed. Keep all reads on the original generation and
 * in its retained observation set; no checkout/CWD/latest source fallback.
 */
function preflightPipelineV10Plugins(document: unknown, configDirectory: string, observations: Observation[], components: Record<Owner, unknown>) {
  if (path.basename(configDirectory) !== 'config') throw new Error('PIPELINE_V10_SOURCE_LAYOUT_REQUIRED');
  v10Plugins ??= JSON.parse(readerAssetBytes.get('pipeline-v10-plugin-schemas.json')!.toString('utf8')) as NonNullable<typeof v10Plugins>;
  const { packages, registrations } = v10Plugins;
  const selections = (document as { pluginSelections: V10PluginSelection[] }).pluginSelections;
  const key = (row: { packageId: string; registrationId: string; kind: string }) => portableJson([row.packageId, row.registrationId, row.kind]);
  const expected = new Set(registrations.map(key)), actual = new Set(selections.map(key));
  if ([...expected].some(id => !actual.has(id)) || [...actual].some(id => !expected.has(id))) {
    throw new Error('PIPELINE_V10_PLUGIN_SOURCE_ROSTER_REQUIRED');
  }
  const read = (relative: string) => {
    const file = path.join(path.dirname(configDirectory), relative);
    requirePhysicalPath(file);
    return readObservedBytes(file, observations);
  };
  const list = (relative: string): string[] => {
    const walk = (directory: string, prefix = ''): string[] => {
      const absolute = path.join(path.dirname(configDirectory), directory); requirePhysicalPath(absolute);
      return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
        const child = path.posix.join(prefix, entry.name);
        if (entry.isSymbolicLink()) throw new Error('PIPELINE_V10_PACKAGE_SOURCE_SYMLINK');
        if (entry.isDirectory()) return walk(path.posix.join(directory, entry.name), child);
        if (!entry.isFile()) throw new Error('PIPELINE_V10_PACKAGE_SOURCE_FILE_TYPE');
        return [child];
      });
    };
    return walk(relative);
  };
  const loaded = new Map<string, { instanceId: string; registrationId?: string; profiles: Record<string, Record<string, unknown>> }>();
  const sections = { stage: 'stages', observer: 'observers', adapter: 'adapters', 'test-provider': 'testProviders' } as const;
  for (const selection of selections) {
    const source = packages[selection.packageId];
    if (!source || selection.ownerPath !== source.ownerPath) throw new Error('PIPELINE_V10_PLUGIN_OWNER_PATH_MISMATCH');
    let owner = loaded.get(selection.packageId);
    if (!owner) {
      let validator = v10PluginValidators.get(selection.packageId);
      if (!validator) {
        const compiler = new AjvConstructor({ allErrors: true, strict: true });
        (addFormats as unknown as (value: unknown) => void)(compiler);
        validator = compiler.compile(source.schema); v10PluginValidators.set(selection.packageId, validator);
      }
      const value: unknown = JSON.parse(read(`config/${source.ownerPath}`).toString('utf8'));
      if (!validator(value)) throw new Error(`PIPELINE_V10_PLUGIN_OWNER_INVALID:${selection.packageId}:${JSON.stringify(validator.errors)}`);
      const supplied = value as { packageId: string; instanceId: string; registrationId?: string; profiles: Record<string, Record<string, unknown>> };
      if (supplied.packageId !== selection.packageId) throw new Error('PIPELINE_V10_PLUGIN_PACKAGE_MISMATCH');
      const manifest: unknown = JSON.parse(read(source.manifestPath).toString('utf8'));
      if (portableJson(manifest) !== portableJson(source.manifest)) throw new Error(`PIPELINE_V10_PLUGIN_MANIFEST_MISMATCH:${selection.packageId}`);
      inspectPipelineV10PackageSource(selection.packageId, path.posix.dirname(source.manifestPath), read, list);
      // Validate ALL declared module/schema locators, not only the chosen
      // profile/registration. Registration identity is tied to its real section.
      const manifestValue = manifest as Record<string, unknown>;
      for (const section of Object.values(sections)) {
        for (const declaration of (manifestValue[section] ?? []) as Record<string, unknown>[]) {
          for (const field of ['module', 'configSchema', 'inputSchema', 'resultSchema']) {
            const relative = declaration[field];
            if (relative === undefined) continue;
            if (typeof relative !== 'string' || !relative || relative.split('/').some(part => !part || part === '.' || part === '..')
              || /[\\\x00-\x20\x7f]/u.test(relative) || path.isAbsolute(relative)) throw new Error('PIPELINE_V10_PLUGIN_SOURCE_PATH_INVALID');
            const bytes = read(path.posix.join(path.posix.dirname(source.manifestPath), relative));
            if (field === 'module') {
              if (!bytes.byteLength) throw new Error('PIPELINE_V10_PLUGIN_MODULE_REQUIRED');
            } else {
              const schema: unknown = JSON.parse(bytes.toString('utf8'));
              if (typeof schema !== 'boolean' && (!schema || typeof schema !== 'object' || Array.isArray(schema))) throw new Error('PIPELINE_V10_PLUGIN_SOURCE_SCHEMA_INVALID');
            }
          }
        }
      }
      owner = supplied; loaded.set(selection.packageId, owner);
    }
    if (owner.instanceId !== selection.instanceId || !Object.hasOwn(owner.profiles, selection.profileId)
      || (owner.registrationId !== undefined && owner.registrationId !== selection.registrationId)) throw new Error('PIPELINE_V10_PLUGIN_SELECTION_MISMATCH');
    const section = sections[selection.kind as keyof typeof sections];
    const declarations = source.manifest[section] as { id: string }[] | undefined;
    if (!declarations || declarations.filter(row => `${selection.packageId}:${row.id}` === selection.registrationId).length !== 1) {
      throw new Error('PIPELINE_V10_PLUGIN_REGISTRATION_KIND_MISMATCH');
    }
    // Nova's package-scoped processing is keyed by the complete registration;
    // runtime-dispatch is the reviewed registration-scoped adapter exception.
    if (source.family === 'nova-module' && owner.registrationId === undefined) {
      for (const profile of Object.values(owner.profiles)) {
        const processing = profile.processing;
        if (!processing || typeof processing !== 'object' || Array.isArray(processing)
          || !Object.hasOwn(processing, selection.registrationId)) throw new Error('PIPELINE_V10_PLUGIN_PROCESSING_REQUIRED');
      }
    }
  }
  validatePipelineV10PluginRelations(document as Record<string, any>, components, loaded, packages);
  return Object.freeze({ packages: loaded.size, registrations: actual.size, activationAllowed: false as const });
}
export interface SwarmBundleIdentity {
  readonly entry: string;
  readonly generationDirectory: string;
  readonly files: readonly Readonly<{ name: string; sha256: string; byteLength: number }>[];
  readonly bindings: readonly Readonly<Binding>[];
  readonly callerId: SwarmSelection['callerId'];
}

/** Envelope validators are also used at the existing owned-host boundary. */
export function validateComponentSettings(name: (typeof settingsDefinitionNames)[number], value: unknown, error: string): void {
  const validate = settingsValidators.get(name);
  if (!validate || !validate(value)) throw new Error(error);
}

function freezeJson(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeJson(child);
  Object.freeze(value);
}

function unchanged(a: fs.BigIntStats, b: fs.BigIntStats): boolean {
  return a.isFile() === b.isFile() && a.isDirectory() === b.isDirectory()
    && a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function readObservedBytes(file: string, observations: Observation[]): Buffer {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(`SWARM_CONFIG_INVALID:not a regular file:${file}`);
    const bytes = fs.readFileSync(fd);
    if (!unchanged(before, fs.fstatSync(fd, { bigint: true }))) throw new Error(`SWARM_CONFIG_CHANGED:${file}`);
    observations.push({ file, fd, before, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength });
    return bytes;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function readDocument(file: string, observations: Observation[]): unknown {
  const raw = readObservedBytes(file, observations).toString('utf8');
  const value: unknown = JSON.parse(raw);
  if ((value as ComponentAuthor)?.schemaVersion === 'pipeline-component.v3'
    && parseDocument(raw, {version: '1.2', schema: 'json', strict: true, uniqueKeys: true}).errors.length) throw new Error('WORKER_CORE_DUPLICATE_AUTHOR');
  return value;
}

/** System trees are physical image files; Kubernetes aliases belong only to boot-receipt transport. */
function requirePhysicalPath(file: string): void {
  const absolute = path.resolve(file);
  if (absolute !== file) throw new Error('SWARM_CONFIG_PATH_NOT_NORMALIZED');
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`SWARM_CONFIG_SYMLINK:${current}`);
    if (current !== absolute && !stat.isDirectory()) throw new Error(`SWARM_CONFIG_DIRECTORY_REQUIRED:${current}`);
  }
}

/** Exact closed consumed-owner selection, shared by receipt parsing and file capture. */
export function validateSwarmSelection(selection: SwarmSelection | undefined): asserts selection is SwarmSelection {
  if (!selection || !['nova', 'buster', 'prism'].includes(selection.role)
    || typeof selection.serviceInstanceId !== 'string' || !/^\S(?:.*\S)?$/u.test(selection.serviceInstanceId)
    || selection.serviceInstanceId.length > 128 || !Object.hasOwn(consumedOwners, selection.callerId)
    || !Array.isArray(selection.bindings)) throw new Error('SWARM_CONFIG_SELECTION_REQUIRED');
  const extended = ['prism-control', 'prism-worker', 'buster-preparation'].includes(selection.callerId) && selection.bindings.some(binding => binding?.owner === 'worker-core');
  const expectedOwners: readonly Owner[] = [...consumedOwners[selection.callerId], ...(extended ? ['worker-core' as const] : [])];
  if (Object.keys(selection).sort().join(',') !== 'bindings,callerId,role,serviceInstanceId'
    || selection.bindings.some(binding => binding === null || typeof binding !== 'object')) {
    throw new Error('SWARM_CONFIG_SELECTION_INVALID');
  }
  if (selection.role !== (selection.callerId.startsWith('prism-') ? 'prism' : 'buster')) {
    throw new Error('SWARM_CONFIG_CALLER_ROLE_INVALID');
  }
  if (selection.bindings.length !== expectedOwners.length
    || new Set(selection.bindings.map(binding => binding.owner)).size !== expectedOwners.length
    || selection.bindings.some(binding => !expectedOwners.includes(binding.owner)
      || binding.instanceId !== selection.serviceInstanceId)) throw new Error('SWARM_CONFIG_SELECTION_OWNERS_INVALID');
  for (const binding of selection.bindings) {
    if (Object.keys(binding).sort().join(',') !== 'instanceId,owner,profileId'
      || typeof binding.profileId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(binding.profileId)) {
      throw new Error('SWARM_CONFIG_SELECTION_BINDING_INVALID');
    }
  }
}

/** Resolve only the entry alias; every component stays in that physical generation. */
export function readSwarmBundle(file: string | undefined, selection?: SwarmSelection): Readonly<{
  components: Readonly<Partial<Record<Owner, Component>>>;
  authors: Readonly<Record<Owner, ComponentAuthor>>;
  profile: Readonly<Record<string, unknown>>;
  identity: SwarmBundleIdentity;
}> {
  if (typeof file !== 'string' || file.length === 0 || !path.isAbsolute(file)) {
    throw new Error('SWARM_CONFIG_PATH_REQUIRED');
  }
  requirePhysicalPath(file);
  const entry = file;
  if (path.basename(entry) !== 'pipeline.config.json') throw new Error('SWARM_CONFIG_RETIRED_ENTRY');
  validateSwarmSelection(selection);
  const generationDirectory = path.dirname(entry);
  const observations: Observation[] = [];
  const directoryObservations: { file: string; fd: number; before: fs.BigIntStats }[] = [];
  try {
    for (const directory of [generationDirectory, path.join(generationDirectory, 'components')]) {
      const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      directoryObservations.push({ file: directory, fd, before: fs.fstatSync(fd, { bigint: true }) });
    }
    const document = readDocument(entry, observations);
    if (document && typeof document === 'object' && (document as { schemaVersion?: unknown }).schemaVersion === 'pipeline-entry.v10') {
      // Do not pass partly checked v10 into v3 codecs/capture/receipt writers.
      // Run its real root/all-owner structural phase first; source/role/infra
      // receiving must be implemented before this branch may return a capture.
      requirePipelineV10Root(document);
      const candidate = {} as Record<Owner, unknown>;
      for (const owner of owners) candidate[owner] = readDocument(path.join(generationDirectory, 'components', `${owner}.config.json`), observations);
      preflightPipelineV10Owners(document, candidate);
      preflightPipelineV10Plugins(document, generationDirectory, observations, candidate);
      preflightPipelineV10Infrastructure(document, candidate, relative => {
        const file = path.join(path.dirname(generationDirectory), relative);
        requirePhysicalPath(file);
        return readObservedBytes(file, observations);
      });
      throw new Error('PIPELINE_V10_SOURCE_RECEIVING_REQUIRED');
    }
    if (!validateEntry(document)) throw new Error(`SWARM_CONFIG_INVALID:${JSON.stringify(validateEntry.errors)}`);
    const { components: references, bindings } = document as { components: Record<Owner, string>; bindings: Binding[] };
    const componentDirectory = path.join(generationDirectory, 'components');
    if (!fs.lstatSync(componentDirectory).isDirectory()) throw new Error('SWARM_CONFIG_COMPONENT_DIRECTORY_REQUIRED');
    const authors = {} as Record<Owner, ComponentAuthor>;
    const components: Partial<Record<Owner, Component>> = {};
    for (const owner of owners) {
      // The strict entry schema fixes every relative path; no include resolver or legacy search.
      const value = readDocument(path.join(generationDirectory, references[owner]), observations);
      if (!(owner === 'worker-core' && (value as ComponentAuthor)?.schemaVersion === 'pipeline-component.v3'
        ? validateWorkerCoreV3Author(value) : validateComponent(value)) || (value as ComponentAuthor).owner !== owner) {
        throw new Error(`SWARM_CONFIG_INVALID:component:${owner}`);
      }
      if (owner === 'prism-control' && (value as ComponentAuthor).schemaVersion === 'pipeline-component.v3') {
        for (const profile of Object.values((value as ComponentAuthor).profiles)) {
          const ranking = captureCorpusRanking(profile.settings.corpusRanking as never);
          const candidateLimit = Number(profile.settings.corpusSearchMaximumLimit) * ranking.candidateMultiplier;
          if (!Number.isSafeInteger(candidateLimit) || candidateLimit > 2147483647) throw new Error('CORPUS_CANDIDATE_LIMIT_INVALID');
        }
      }
      freezeJson(value);
      authors[owner] = value as ComponentAuthor;
    }
    if (['prism-control', 'prism-worker', 'buster-preparation'].includes(selection.callerId)) {
      const required = authors['worker-core'].schemaVersion === 'pipeline-component.v3';
      if (selection.bindings.some(binding => binding.owner === 'worker-core') !== required) throw new Error('WORKER_CORE_VERSIONED_SELECTION_REQUIRED');
    }
    const seen = new Set<string>();
    for (const binding of bindings) {
      const key = JSON.stringify([binding.role, binding.owner, binding.instanceId]);
      if (seen.has(key)) throw new Error('SWARM_CONFIG_DUPLICATE_BINDING');
      seen.add(key);
      if (!Object.hasOwn(authors[binding.owner].profiles, binding.profileId)) {
        throw new Error(`SWARM_CONFIG_PROFILE_REQUIRED:${binding.owner}:${binding.profileId}`);
      }
    }
    const selectedBindings: Binding[] = [];
    for (const projected of selection.bindings) {
      const owner: Owner = projected.owner;
      const binding = bindings.find(binding => binding.role === selection.role
        && binding.instanceId === selection.serviceInstanceId && binding.owner === owner);
      if (!binding) throw new Error(`SWARM_CONFIG_BINDING_REQUIRED:${owner}`);
      if (binding.profileId !== projected.profileId) throw new Error(`SWARM_CONFIG_SELECTION_PROFILE_MISMATCH:${owner}`);
      selectedBindings.push(binding);
      const author = authors[owner];
      const profile = author.profiles[binding.profileId];
      if (!profile) throw new Error(`SWARM_CONFIG_PROFILE_REQUIRED:${owner}:${binding.profileId}`);
      components[owner] = Object.freeze({ schemaVersion: author.schemaVersion, owner,
        settings: profile.settings });
    }
    for (const observation of observations) {
      if (!unchanged(observation.before, fs.fstatSync(observation.fd, { bigint: true }))
        || !unchanged(observation.before, fs.lstatSync(observation.file, { bigint: true }))) {
        throw new Error(`SWARM_CONFIG_CHANGED:${observation.file}`);
      }
    }
    for (const observation of directoryObservations) {
      if (!unchanged(observation.before, fs.fstatSync(observation.fd, { bigint: true }))
        || !unchanged(observation.before, fs.lstatSync(observation.file, { bigint: true }))) {
        throw new Error(`SWARM_CONFIG_CHANGED:${observation.file}`);
      }
    }
    const identity: SwarmBundleIdentity = Object.freeze({
      entry, generationDirectory,
      files: Object.freeze(observations.map(item => Object.freeze({ name: path.relative(generationDirectory, item.file), sha256: item.sha256,
        byteLength: item.byteLength }))),
      bindings: Object.freeze(selectedBindings.map(binding => Object.freeze({ ...binding }))),
      callerId: selection.callerId,
    });
    const entryValues = document as Record<string, unknown>;
    const profile = { _doc: entryValues._doc, profile: entryValues.profile, features: entryValues.features,
      tuning: entryValues.tuning, overrides: entryValues.overrides };
    freezeJson(profile);
    return Object.freeze({ components: Object.freeze(components), authors: Object.freeze(authors), profile, identity });
  } finally {
    for (const observation of observations) fs.closeSync(observation.fd);
    for (const observation of directoryObservations) fs.closeSync(observation.fd);
  }
}
