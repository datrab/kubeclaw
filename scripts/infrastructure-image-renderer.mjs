#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, dump } from 'js-yaml';

const root = fileURLToPath(new URL('../', import.meta.url));

export function bindInfrastructureImages(name, documents) {
  if (!['qdrant', 'tailscale'].includes(name)) throw new Error('INFRASTRUCTURE_IMAGE_PROFILE_INVALID');
  const images = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8')).infrastructure;
  const bindings = new Map([[images.qdrant.split('@')[0], images.qdrant]]);
  const result = structuredClone(documents);
  for (const document of result) {
    const pod = podSpec(document);
    if (!pod) continue;
    for (const container of [...(pod.initContainers ?? []), ...(pod.containers ?? [])]) {
      const target = bindings.get(container.image);
      if (target && name === 'qdrant') container.image = target;
      if (!/^\S+@sha256:[a-f0-9]{64}$/.test(container.image)) throw new Error('INFRASTRUCTURE_IMAGE_NOT_PINNED');
      verifyReservedImage(name, container, images);
    }
  }
  return result;
}

function podSpec(document) {
  if (document.kind === 'Pod') return document.spec;
  if (document.kind === 'CronJob') return document.spec?.jobTemplate?.spec?.template?.spec;
  if (['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'ReplicaSet'].includes(document.kind)) return document.spec?.template?.spec;
  return null;
}

function verifyReservedImage(name, container, images) {
  const variables = container.env ?? [];
  if (new Set(variables.map(variable => variable.name)).size !== variables.length) throw new Error('INFRASTRUCTURE_DUPLICATE_ENVIRONMENT');
  if (name === 'qdrant' && ['qdrant', 'ensure-dir-ownership'].includes(container.name) && container.image !== images.qdrant) {
    throw new Error('INFRASTRUCTURE_QDRANT_IMAGE_OVERRIDE');
  }
  if (name === 'tailscale' && container.name === 'operator') {
    const proxy = variables.find(variable => variable.name === 'PROXY_IMAGE');
    if (!proxy) throw new Error('INFRASTRUCTURE_PROXY_IMAGE_REQUIRED');
    const digestOnly = reference => reference.replace(/:[^:@]+@/, '@');
    if (container.image !== digestOnly(images.tailscaleOperator) || proxy.value !== digestOnly(images.tailscaleProxy)) {
      throw new Error('INFRASTRUCTURE_TAILSCALE_IMAGE_OVERRIDE');
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: infrastructure-image-renderer.mjs PROFILE');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 64 * 1024 * 1024) throw new Error('INFRASTRUCTURE_RENDER_LIMIT');
    chunks.push(chunk);
  }
  const documents = loadAll(Buffer.concat(chunks).toString('utf8')).filter(Boolean);
  process.stdout.write(bindInfrastructureImages(process.argv[2], documents)
    .map(document => dump(document, { noRefs: true, lineWidth: -1 })).join('---\n'));
}
