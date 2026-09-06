import fs from 'node:fs';
import path from 'node:path';

// Production build receipts are downloaded from one successful, verified workflow run.
export function collectReceipts(directory, commit, expected) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Full source commit required');
  const receipts = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
  const images = {};
  for (const receipt of receipts) {
    if (receipt.commit !== commit || !expected.includes(receipt.name) || images[receipt.name]
      || !/^ghcr\.io\/[a-z0-9_-]+\/kubeclaw-[a-z0-9-]+@sha256:[a-f0-9]{64}$/.test(receipt.image)
      || !receipt.image.includes(`/kubeclaw-${receipt.name}@`)) throw new Error('Invalid, duplicate or cross-commit image receipt');
    images[receipt.name] = receipt.image;
  }
  if (Object.keys(images).length !== expected.length) throw new Error('Release is missing required images');
  return { schemaVersion: 1, commit, images };
}
if (process.argv[1] === import.meta.filename) {
  const [directory, commit, output] = process.argv.slice(2);
  const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
  const release = collectReceipts(directory, commit, names);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(release, null, 2) + '\n');
}
