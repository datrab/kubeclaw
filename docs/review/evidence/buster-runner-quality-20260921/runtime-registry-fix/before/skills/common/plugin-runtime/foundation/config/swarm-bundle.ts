import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';

const owners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'] as const;
type Owner = typeof owners[number];
interface Validator { (value: unknown): boolean; errors?: unknown[] | null }
const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => {
  compile(schema: object): Validator;
};
const ajv = new AjvConstructor({ allErrors: true, strict: true });
const entrySchema = JSON.parse(fs.readFileSync(new URL('./swarm.schema.json', import.meta.url), 'utf8')) as object;
const componentSchema = JSON.parse(fs.readFileSync(new URL('./swarm-components.schema.json', import.meta.url), 'utf8')) as {
  $defs: Record<string, object>;
};
const validateEntry = ajv.compile(entrySchema);
const validateComponent = ajv.compile(componentSchema);
const settingsValidators = new Map(['buster-preparation', 'buster-admission', 'buster-dependency-readiness'].map(name => [name, ajv.compile({
  $defs: componentSchema.$defs, $ref: `#/$defs/${name}`,
})]));
interface Component {
  readonly schemaVersion: 'swarm-component.v1';
  readonly owner: Owner;
  readonly settings: Readonly<Record<string, unknown>>;
}
interface Observation {
  readonly file: string;
  readonly fd: number;
  readonly before: fs.BigIntStats;
  readonly sha256: string;
}
export interface SwarmBundleIdentity {
  readonly entry: string;
  readonly generationDirectory: string;
  readonly files: readonly Readonly<{ name: string; sha256: string }>[];
}

/** Envelope validators are also used at the existing owned-host boundary. */
export function validateComponentSettings(name: 'buster-preparation' | 'buster-admission' | 'buster-dependency-readiness' | 'buster-execution' | 'buster-execution-observation', value: unknown, error: string): void {
  const validate = settingsValidators.get(name);
  if (!validate || !validate(value)) throw new Error(error);
}

function freezeJson(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeJson(child);
  Object.freeze(value);
}

function unchanged(a: fs.BigIntStats, b: fs.BigIntStats): boolean {
  return b.isFile() && a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function readDocument(file: string, observations: Observation[]): unknown {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(`SWARM_CONFIG_INVALID:not a regular file:${file}`);
    const bytes = fs.readFileSync(fd);
    if (!unchanged(before, fs.fstatSync(fd, { bigint: true }))) throw new Error(`SWARM_CONFIG_CHANGED:${file}`);
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    observations.push({ file, fd, before, sha256: createHash('sha256').update(bytes).digest('hex') });
    return value;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

/** Resolve only the entry alias; every component stays in that physical generation. */
export function readSwarmBundle(file: string | undefined): Readonly<{
  components: Readonly<Record<Owner, Component>>;
  profile: Readonly<Record<string, unknown>>;
  identity: SwarmBundleIdentity;
}> {
  if (typeof file !== 'string' || file.length === 0 || !path.isAbsolute(file)) {
    throw new Error('SWARM_CONFIG_PATH_REQUIRED');
  }
  const entry = fs.realpathSync(file);
  const generationDirectory = path.dirname(entry);
  const observations: Observation[] = [];
  try {
    const document = readDocument(entry, observations);
    if (!validateEntry(document)) throw new Error(`SWARM_CONFIG_INVALID:${JSON.stringify(validateEntry.errors)}`);
    const references = (document as { components: Record<Owner, string> }).components;
    const components = {} as Record<Owner, Component>;
    for (const owner of owners) {
      // The strict entry schema fixes each filename; there is no include resolver.
      const value = readDocument(path.join(generationDirectory, references[owner]), observations);
      if (!validateComponent(value) || (value as Component).owner !== owner) {
        throw new Error(`SWARM_CONFIG_INVALID:component:${owner}`);
      }
      freezeJson(value);
      components[owner] = value as Component;
    }
    for (const observation of observations) {
      if (!unchanged(observation.before, fs.fstatSync(observation.fd, { bigint: true }))
        || !unchanged(observation.before, fs.lstatSync(observation.file, { bigint: true }))) {
        throw new Error(`SWARM_CONFIG_CHANGED:${observation.file}`);
      }
    }
    const identity: SwarmBundleIdentity = Object.freeze({
      entry, generationDirectory,
      files: Object.freeze(observations.map(item => Object.freeze({ name: path.basename(item.file), sha256: item.sha256 }))),
    });
    const entryValues = document as Record<string, unknown>;
    const profile = { _doc: entryValues._doc, profile: entryValues.profile, features: entryValues.features,
      tuning: entryValues.tuning, overrides: entryValues.overrides };
    freezeJson(profile);
    return Object.freeze({ components: Object.freeze(components), profile, identity });
  } finally {
    for (const observation of observations) fs.closeSync(observation.fd);
  }
}
