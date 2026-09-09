import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { LineCounter, parseAllDocuments } from 'yaml';

import { renderChart } from './helm-render.ts';

type AnyRecord = Record<string, any>;

function inside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function digest(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function renderedDocumentSource(content: string, chartSource: string, offset: number): string {
  const prefix = content.slice(0, offset);
  const matches = [...prefix.matchAll(/^# Source:\s+(.+)$/gmu)];
  const annotated = matches.at(-1)?.[1]?.trim();
  if (!annotated) return chartSource;
  const chartName = path.posix.basename(chartSource.split(path.sep).join('/'));
  if (!annotated.startsWith(`${chartName}/`)) return chartSource;
  const candidate = path.posix.normalize(`${chartSource.split(path.sep).join('/')}/${annotated.slice(chartName.length + 1)}`);
  const chartPrefix = `${chartSource.split(path.sep).join('/')}/`;
  return candidate.startsWith(chartPrefix) ? candidate : chartSource;
}

function validateKubernetesInputs(ctx: AnyRecord): void {
  const repositoryRoot = fs.realpathSync(ctx.repoRoot);
  const projectRoot = fs.realpathSync(path.resolve(repositoryRoot, ctx.policyProject.root));
  if (!inside(repositoryRoot, projectRoot)) throw Object.assign(new Error('Kubernetes project root escapes repository root'), { code: 'kubernetes-manifest-path-invalid' });
  const settings = ctx.policyProject.kubernetes;
  let fileCount = 0;
  const validateFile = (absolute: string, source: string) => {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw Object.assign(new Error(`${source} must not be a symbolic link`), { code: 'kubernetes-manifest-symlink-invalid' });
    if (!stat.isFile()) throw Object.assign(new Error(`${source} is not a regular file`), { code: 'kubernetes-manifest-path-invalid' });
    const real = fs.realpathSync(absolute);
    if (!inside(projectRoot, real)) throw Object.assign(new Error(`${source} escapes project root`), { code: 'kubernetes-manifest-path-invalid' });
    fileCount += 1;
    if (fileCount > settings.limits.max_files) throw Object.assign(new Error('combined Kubernetes inputs exceed max_files'), { code: 'kubernetes-manifest-file-limit' });
    if (stat.size > settings.limits.max_file_bytes) throw Object.assign(new Error(`${source} exceeds max_file_bytes`), { code: 'kubernetes-manifest-size-limit' });
  };
  const walkChart = (directory: string, source: string) => {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) throw Object.assign(new Error(`${source} must not be a symbolic link`), { code: 'kubernetes-manifest-symlink-invalid' });
    if (!stat.isDirectory()) throw Object.assign(new Error(`${source} is not a directory`), { code: 'kubernetes-manifest-path-invalid' });
    const real = fs.realpathSync(directory);
    if (!inside(projectRoot, real)) throw Object.assign(new Error(`${source} escapes project root`), { code: 'kubernetes-manifest-path-invalid' });
    for (const name of fs.readdirSync(directory).sort()) {
      const child = path.join(directory, name);
      const childSource = `${source}/${name}`;
      const childStat = fs.lstatSync(child);
      if (childStat.isDirectory()) walkChart(child, childSource);
      else validateFile(child, childSource);
    }
  };
  for (const relative of settings.raw_manifests) validateFile(path.resolve(projectRoot, relative), relative);
  for (const relative of settings.helm_charts) walkChart(path.resolve(projectRoot, relative), relative);
}

function parseSource(content: string, source: string, sourceKind: string, limits: AnyRecord): { resources: AnyRecord[]; documentCount: number } {
  if (Buffer.byteLength(content) > limits.max_rendered_bytes) throw Object.assign(new Error(`${source} exceeds max_rendered_bytes`), { code: 'kubernetes-manifest-size-limit' });
  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(content, { lineCounter, prettyErrors: false, strict: true });
  if (documents.length > limits.max_documents) throw Object.assign(new Error(`${source} exceeds max_documents`), { code: 'kubernetes-manifest-document-limit' });
  const resources: AnyRecord[] = [];
  documents.forEach((document, index) => {
    if (document.errors.length > 0) {
      const error = document.errors[0]!;
      throw Object.assign(new Error(`${source}: ${error.message}`), { code: 'kubernetes-manifest-yaml-invalid' });
    }
    const value = document.toJS({ maxAliasCount: 100 });
    if (value === null || value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${source} document ${index + 1} is not a Kubernetes object`), { code: 'kubernetes-manifest-object-invalid' });
    const start = document.contents?.range?.[0] ?? 0;
    resources.push({
      value,
      document,
      lineCounter,
      source: sourceKind === 'helm-render' ? renderedDocumentSource(content, source, start) : source,
      source_kind: sourceKind,
      document_index: index + 1,
      line: lineCounter.linePos(start).line,
    });
  });
  return { resources, documentCount: documents.length };
}

async function loadKubernetesResources(ctx: AnyRecord): Promise<{ resources: AnyRecord[]; sources: AnyRecord[] }> {
  validateKubernetesInputs(ctx);
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  const settings = ctx.policyProject.kubernetes;
  const resources: AnyRecord[] = [];
  const sources: AnyRecord[] = [];
  let documentCount = 0;
  for (const relative of settings.raw_manifests) {
    const absolute = path.resolve(projectRoot, relative);
    if (!inside(projectRoot, absolute)) throw Object.assign(new Error(`raw manifest escapes project root: ${relative}`), { code: 'kubernetes-manifest-path-invalid' });
    const content = fs.readFileSync(absolute, 'utf8');
    if (Buffer.byteLength(content) > settings.limits.max_file_bytes) throw Object.assign(new Error(`${relative} exceeds max_file_bytes`), { code: 'kubernetes-manifest-size-limit' });
    const parsed = parseSource(content, relative, 'raw', settings.limits);
    resources.push(...parsed.resources);
    documentCount += parsed.documentCount;
    sources.push({ kind: 'raw-manifest', source: relative, sha256: digest(content), bytes: Buffer.byteLength(content) });
  }
  for (const relative of settings.helm_charts) {
    const absolute = path.resolve(projectRoot, relative);
    if (!inside(projectRoot, absolute)) throw Object.assign(new Error(`Helm chart escapes project root: ${relative}`), { code: 'kubernetes-manifest-path-invalid' });
    const content = await renderChart(ctx, absolute);
    const parsed = parseSource(content, relative, 'helm-render', settings.limits);
    resources.push(...parsed.resources);
    documentCount += parsed.documentCount;
    sources.push({ kind: 'helm-render', source: relative, sha256: digest(content), bytes: Buffer.byteLength(content) });
  }
  if (documentCount > settings.limits.max_documents) throw Object.assign(new Error('combined Kubernetes inputs exceed max_documents'), { code: 'kubernetes-manifest-document-limit' });
  return { resources, sources };
}

function nodeLine(resource: AnyRecord, keys: Array<string | number>): number {
  const node = resource.document.getIn(keys, true);
  const offset = node?.range?.[0];
  return typeof offset === 'number' ? resource.lineCounter.linePos(offset).line : resource.line;
}

export { loadKubernetesResources, nodeLine, validateKubernetesInputs };
