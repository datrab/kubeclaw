import path from 'node:path';

import type { ReviewMapRelation } from './review-map-artifacts.ts';
import { reviewImportSpecifiersWithLines } from './review-context-production.ts';
import type { ReviewSourceDocument } from './review-fact-extractors.ts';
import { jsoncObject, strictJsonObject } from './review-json.ts';
import { compareCodeUnits } from './review-ordering.ts';

interface LocalAlias { readonly key: string; readonly targets: readonly string[]; readonly root: string;
  readonly repositoryWide: boolean; readonly packagePrefix: boolean; readonly resolvedOnly: boolean }
function packageAlias(document: ReviewSourceDocument, value: Readonly<Record<string, unknown>>): readonly LocalAlias[] {
  if (path.posix.basename(document.path) !== 'package.json' || typeof value.name !== 'string') return [];
  const root = path.posix.dirname(document.path);
  return [{ key: value.name, targets: [root, root + '/src'], root, repositoryWide: true,
    packagePrefix: true, resolvedOnly: false }];
}
function pathAliases(value: unknown, base: string, root: string): readonly LocalAlias[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, targets]) => (
    Array.isArray(targets) && targets.every((target) => typeof target === 'string')
      ? [{ key, targets: targets.map((target) => path.posix.normalize(path.posix.join(base, target))),
        root, repositoryWide: false, packagePrefix: false, resolvedOnly: false }] : []
  ));
}
function directTsconfigAliases(document: ReviewSourceDocument): readonly LocalAlias[] {
  if (!/^tsconfig(?:\.[^.]+)?\.json$/u.test(path.posix.basename(document.path))) return [];
  const value = jsoncObject(document.content); if (!value) return [];
  const compiler = value.compilerOptions;
  if (!compiler || typeof compiler !== 'object' || Array.isArray(compiler)) return [];
  const options = compiler as Readonly<Record<string, unknown>>;
  const root = path.posix.dirname(document.path);
  const base = path.posix.normalize(path.posix.join(root, typeof options.baseUrl === 'string' ? options.baseUrl : '.'));
  const configured = pathAliases(options.paths, base, root);
  return typeof options.baseUrl === 'string'
    ? [...configured, { key: '*', targets: [base + '/*'], root, repositoryWide: false,
      packagePrefix: false, resolvedOnly: true }] : configured;
}

function extendedConfig(
  document: ReviewSourceDocument, value: Readonly<Record<string, unknown>>,
  configs: ReadonlyMap<string, ReviewSourceDocument>,
): ReviewSourceDocument | undefined {
  if (typeof value.extends !== 'string' || !value.extends.startsWith('.')) return undefined;
  const supplied = path.posix.normalize(path.posix.join(path.posix.dirname(document.path), value.extends));
  const candidates = path.posix.extname(supplied)
    ? [supplied] : [supplied, `${supplied}.json`, `${supplied}/tsconfig.json`];
  return candidates.map((candidate) => configs.get(candidate)).find(Boolean);
}

function tsconfigAliases(
  document: ReviewSourceDocument, configs: ReadonlyMap<string, ReviewSourceDocument>, visiting = new Set<string>(),
): readonly LocalAlias[] {
  if (visiting.has(document.path)) return [];
  const value = jsoncObject(document.content); if (!value) return [];
  const direct = directTsconfigAliases(document);
  const parent = extendedConfig(document, value, configs); if (!parent) return direct;
  const next = new Set(visiting); next.add(document.path);
  const root = path.posix.dirname(document.path), overridden = new Set(direct.map(({ key }) => key));
  const inherited = tsconfigAliases(parent, configs, next).filter(({ key }) => !overridden.has(key))
    .map((alias) => ({ ...alias, root, repositoryWide: false }));
  return [...direct, ...inherited];
}
function aliasSpecificity(alias: LocalAlias): number {
  const star = alias.key.indexOf('*'); return star < 0 ? 1_000_000 + alias.key.length : star;
}
function compareAliases(left: LocalAlias, right: LocalAlias): number {
  const breadth = Number(left.repositoryWide) - Number(right.repositoryWide); if (breadth !== 0) return breadth;
  const root = right.root.length - left.root.length; if (root !== 0) return root;
  const specificity = aliasSpecificity(right) - aliasSpecificity(left);
  return specificity !== 0 ? specificity : compareCodeUnits(left.key, right.key);
}
function packageAliases(documents: readonly ReviewSourceDocument[]): readonly LocalAlias[] {
  return documents.flatMap((document) => {
    const value = strictJsonObject(document.content);
    return value ? packageAlias(document, value) : [];
  }).sort(compareAliases);
}

function nearestConfig(
  source: string, configs: readonly ReviewSourceDocument[],
): ReviewSourceDocument | undefined {
  return configs.filter((document) => {
    const root = path.posix.dirname(document.path);
    return root === '.' || source.startsWith(`${root}/`);
  }).sort((left, right) => {
    const depth = path.posix.dirname(right.path).length - path.posix.dirname(left.path).length;
    if (depth !== 0) return depth;
    const canonical = Number(path.posix.basename(right.path) === 'tsconfig.json')
      - Number(path.posix.basename(left.path) === 'tsconfig.json');
    return canonical || compareCodeUnits(left.path, right.path);
  })[0];
}
function aliasMatch(alias: LocalAlias, specifier: string): string | undefined {
  const star = alias.key.indexOf('*');
  if (star < 0) return specifier === alias.key || (alias.packagePrefix && specifier.startsWith(alias.key + '/'))
    ? specifier.slice(alias.key.length).replace(/^\//u, '') : undefined;
  const prefix = alias.key.slice(0, star), suffix = alias.key.slice(star + 1);
  return specifier.startsWith(prefix) && specifier.endsWith(suffix)
    ? specifier.slice(prefix.length, specifier.length - suffix.length) : undefined;
}
function resolveAliasTarget(target: string, capture: string, tracked: ReadonlySet<string>): string | undefined {
  const raw = target.includes('*') ? target.replaceAll('*', capture) : path.posix.join(target, capture);
  const supplied = path.posix.normalize(raw);
  const extension = path.posix.extname(supplied), stem = extension ? supplied.slice(0, -extension.length) : supplied;
  const options = [supplied, ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
    .flatMap((item) => [stem + item, supplied + '/index' + item])].map((candidate) => path.posix.normalize(candidate));
  return options.find((candidate) => tracked.has(candidate));
}
function aliasApplies(alias: LocalAlias, source: string): boolean {
  if (alias.repositoryWide || alias.root === '.') return true;
  return source.startsWith(alias.root + '/');
}

export function extractTypeScriptAliasRelations(
  documents: readonly ReviewSourceDocument[], tracked: ReadonlySet<string>,
): readonly ReviewMapRelation[] {
  const packages = packageAliases(documents);
  const configDocuments = documents.filter(({ path: file }) => /^tsconfig(?:\.[^.]+)?\.json$/u.test(path.posix.basename(file)));
  const configs = new Map(configDocuments.map((document) => [document.path, document]));
  return documents.flatMap((document) => {
    if (!/\.[cm]?[jt]sx?$/u.test(document.path)) return [];
    const config = nearestConfig(document.path, configDocuments);
    const configured = [...(config ? tsconfigAliases(config, configs) : []), ...packages].sort(compareAliases);
    return reviewImportSpecifiersWithLines(document.content).flatMap(({ specifier, line }) => {
      if (specifier.startsWith('.') || specifier.startsWith('node:')) return [];
      const matches = configured.flatMap((alias) => {
        const capture = aliasMatch(alias, specifier); if (!aliasApplies(alias, document.path) || capture === undefined) return [];
        const resolved = alias.targets.map((target) => resolveAliasTarget(target, capture, tracked)).find(Boolean);
        return resolved || !alias.resolvedOnly ? [{ alias, capture, resolved }] : [];
      });
      const selected = matches[0]; if (!selected) return [];
      const { alias, capture, resolved } = selected;
      const fallback = alias.targets[0]?.replaceAll('*', capture) ?? 'resource:module:' + specifier;
      return [{ type: 'imports', from: document.path, to: resolved ?? fallback,
        extractor: 'typescript-local-alias', confidence: 'exact', provenance: `${document.path}:${line}` } as const];
    });
  });
}
