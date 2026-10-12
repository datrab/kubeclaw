import path from 'node:path';

import type { ReviewMapRelation } from './review-map-artifacts.ts';
import type { ReviewSourceDocument } from './review-fact-extractors.ts';

function isTestPath(file: string): boolean {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u.test(file);
}

function componentRoot(file: string): string {
  const match = file.match(/^(?:(.*?)\/)?(?:src|test|tests|__tests__)\//u);
  return match ? (match[1] ?? '.') : path.posix.dirname(file);
}

function stem(file: string): string {
  return path.posix.basename(file).replace(/\.[^.]+$/u, '').replace(/\.(?:test|spec)$/u, '');
}

function targetKey(file: string): string {
  return `${componentRoot(file)}\0${stem(file)}`;
}

function targetsByRootAndStem(documents: readonly ReviewSourceDocument[]): ReadonlyMap<string, readonly string[]> {
  const output = new Map<string, string[]>();
  for (const { path: file } of documents) {
    if (isTestPath(file)) continue;
    const key = targetKey(file), values = output.get(key) ?? [];
    values.push(file); output.set(key, values);
  }
  return output;
}

export function extractTestNameRelations(documents: readonly ReviewSourceDocument[]): readonly ReviewMapRelation[] {
  const targets = targetsByRootAndStem(documents);
  return documents.filter(({ path: file }) => isTestPath(file)).flatMap((document) => (
    (targets.get(targetKey(document.path)) ?? []).map((candidate) => Object.freeze({
      type: 'tests', from: document.path, to: candidate, extractor: 'test-name',
      confidence: 'derived', provenance: document.path,
    }))
  ));
}
