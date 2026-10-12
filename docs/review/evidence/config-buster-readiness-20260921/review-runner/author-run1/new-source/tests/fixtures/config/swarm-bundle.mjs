/** Raw authored test documents. Never supplies missing settings or replaces a loader. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const componentOwners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'];
export const bundleNames = ['swarm.config.json', ...componentOwners.map(owner => `${owner}.config.json`)];

export function readTestBundle(entryFile) {
  const canonical = fs.realpathSync(entryFile instanceof URL ? fileURLToPath(entryFile) : entryFile);
  /** @type {Record<string, any>} */
  const documents = { entry: JSON.parse(fs.readFileSync(canonical, 'utf8')) };
  for (const owner of componentOwners) {
    documents[owner] = JSON.parse(fs.readFileSync(path.join(path.dirname(canonical), `${owner}.config.json`), 'utf8'));
  }
  return documents;
}

/** Writes raw documents exactly, including invalid values deliberately authored by a test. */
export function writeTestBundle(entryFile, documents) {
  fs.mkdirSync(path.dirname(entryFile), { recursive: true });
  fs.writeFileSync(entryFile, JSON.stringify(documents.entry));
  for (const owner of componentOwners) {
    fs.writeFileSync(path.join(path.dirname(entryFile), `${owner}.config.json`), JSON.stringify(documents[owner]));
  }
}

/** Valid-profile assertion projection only; never feeds a production loader or writes a bundle. */
export function projectTestBundle(documents) {
  const { schemaVersion: _version, components: _references, ...metadata } = documents.entry;
  const { dispatchTimeoutMs, ...control } = documents['prism-control'].settings;
  return { ...metadata, operator: {
    prism: { control, studio: documents['prism-studio'].settings,
      worker: documents['prism-worker'].settings.ingress,
      native: { ...documents['prism-execution'].settings, dispatchTimeoutMs,
        supervisor: documents['prism-worker'].settings.supervisor } },
    buster: documents['buster-engine'].settings,
  } };
}

/** ConfigMap delivery remains seven real raw files; no reconstruction of production input. */
export function bundleFromConfigMap(data) {
  /** @type {Record<string, any>} */
  const documents = { entry: JSON.parse(data['swarm.config.json']) };
  for (const owner of componentOwners) documents[owner] = JSON.parse(data[`${owner}.config.json`]);
  return documents;
}

export const canonicalSwarmEntry = fileURLToPath(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
