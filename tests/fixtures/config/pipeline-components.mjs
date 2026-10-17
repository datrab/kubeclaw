/** Raw current authored files only. No default refill, fake boot receipt or loader replacement. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentOwners } from './swarm-bundle.mjs';

export const canonicalPipelineEntry = fileURLToPath(new URL('../../../config/pipeline.config.json', import.meta.url));

export function readTestPipeline(entryFile = canonicalPipelineEntry) {
  const file = entryFile instanceof URL ? fileURLToPath(entryFile) : entryFile;
  const documents = { entry: JSON.parse(fs.readFileSync(file, 'utf8')) };
  for (const owner of componentOwners) {
    documents[owner] = JSON.parse(fs.readFileSync(path.join(path.dirname(file), documents.entry.components[owner]), 'utf8'));
  }
  return documents;
}

/** Preserve raw invalid test authors too: production readers decide validity. */
export function writeTestPipeline(entryFile, documents) {
  fs.mkdirSync(path.join(path.dirname(entryFile), 'components'), { recursive: true });
  fs.writeFileSync(entryFile, JSON.stringify(documents.entry));
  for (const owner of componentOwners) {
    fs.writeFileSync(path.join(path.dirname(entryFile), documents.entry.components[owner]), JSON.stringify(documents[owner]));
  }
}

/** Explicit consumed-owner tuple from the actual authored Buster runtime binding. Not boot authentication. */
export function busterRuntimeSelection(documents) {
  const serviceInstanceId = 'kubeclaw/agent-buster/buster-v2-runtime';
  return { role: 'buster', callerId: 'buster-runtime', serviceInstanceId,
    bindings: documents.entry.bindings.filter(binding => binding.instanceId === serviceInstanceId)
      .map(({ role: _role, ...binding }) => binding) };
}
