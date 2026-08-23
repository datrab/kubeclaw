/* eslint-disable max-lines -- Extractors share ordered source provenance and one deterministic relation reducer. */
import path from 'node:path';
import { relationKey, type ReviewMapRelation } from './review-map-artifacts.ts';
import { reviewImportReferences } from './review-context-production.ts';
import { extractTypeScriptAliasRelations } from './review-local-aliases.ts';
import { extractTestNameRelations } from './review-test-relations.ts';
import { strictJsonObject } from './review-json.ts';
import { compareCodeUnits } from './review-ordering.ts';

export interface ReviewSourceDocument { readonly path: string; readonly content: string }
function newlineOffsets(content: string): readonly number[] {
  const output = [0]; for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) output.push(index + 1);
  } return output;
}
function indexedLineNumber(offsets: readonly number[], index: number): number {
  let low = 0, high = offsets.length;
  while (low < high) { const middle = Math.floor((low + high) / 2);
    if ((offsets[middle] as number) <= index) low = middle + 1; else high = middle; }
  return low;
}

function relation(type: string, from: string, to: string,
  proof: Pick<ReviewMapRelation, 'extractor' | 'confidence' | 'provenance'>): ReviewMapRelation { return Object.freeze({ type, from, to, ...proof }); }
function generatedTarget(value: string): string { return /(?:^|\/)generated(?:\/|$)|\.generated\.[^.]+$/u.test(value)
  ? `resource:generated-file:${value}` : value; }

function typescriptRelations(document: ReviewSourceDocument, tracked: ReadonlySet<string>): readonly ReviewMapRelation[] {
  if (!/\.[cm]?[jt]sx?$/u.test(document.path)) return [];
  return reviewImportReferences(document.path, document.content, tracked).map((reference) => (
    relation('imports', document.path, reference.resolvedPath ?? generatedTarget(reference.unresolvedPath),
      { extractor: 'typescript-module-resolution', confidence: 'exact', provenance: `${document.path}:${reference.line}` })
  ));
}

interface GoModule { readonly name: string; readonly root: string }
function goModules(documents: readonly ReviewSourceDocument[]): readonly GoModule[] {
  return documents.flatMap((document) => {
    if (path.posix.basename(document.path) !== 'go.mod') return [];
    const name = /^module[\t ]+(\S+?)[\t ]*(?:\/\/[^\n]*)?$/mu.exec(document.content)?.[1];
    return name ? [{ name, root: path.posix.dirname(document.path) }] : [];
  }).sort((left, right) => right.root.length - left.root.length || compareCodeUnits(left.name, right.name));
}

function importedGoModule(modules: readonly GoModule[], imported: string): GoModule | undefined {
  return modules.filter(({ name }) => imported === name || imported.startsWith(`${name}/`))
    .sort((left, right) => right.name.length - left.name.length || compareCodeUnits(left.name, right.name))[0];
}

type GoScanMode = 'code' | 'double' | 'rune' | 'raw' | 'line_comment' | 'block_comment';
interface GoScanState {
  readonly content: string; readonly output: string[]; cursor: number; mode: GoScanMode; escaped: boolean; importBlock: boolean; preserveRaw: boolean;
}
function maskGo(state: GoScanState, offset = 0): void { const index = state.cursor + offset;
  if (state.output[index] !== '\n') state.output[index] = ' '; }
function scanGoLineComment(state: GoScanState): void { const newline = state.content[state.cursor] === '\n';
  maskGo(state); if (newline) state.mode = 'code'; }
function scanGoBlockComment(state: GoScanState): void {
  const closes = state.content[state.cursor] === '*' && state.content[state.cursor + 1] === '/'; maskGo(state);
  if (closes) { maskGo(state, 1); state.cursor += 1; state.mode = 'code'; }
}
function scanGoRaw(state: GoScanState): void {
  const closes = state.content[state.cursor] === '`'; if (!state.preserveRaw) maskGo(state);
  if (closes) { state.mode = 'code'; state.preserveRaw = false; }
}
function scanGoQuoted(state: GoScanState, closing: string): void {
  const current = state.content[state.cursor] as string;
  // Keep quoted bytes visible. Import regexes are line-anchored, so ordinary strings cannot become declarations.
  if (!state.escaped && current === closing) state.mode = 'code';
  state.escaped = !state.escaped && current === '\\';
}
function scanGoImportParenthesis(state: GoScanState, current: string | undefined): boolean {
  if (current === '(') {
    const prefix = state.output.slice(Math.max(0, state.cursor - 64), state.cursor).join('').trimEnd();
    if (/\bimport$/u.test(prefix)) state.importBlock = true;
    return true;
  }
  if (current !== ')') return false;
  state.importBlock = false; return true;
}
function scanGoRawOpening(state: GoScanState, current: string | undefined): boolean {
  if (current !== '`') return false;
  const lineStart = state.content.lastIndexOf('\n', state.cursor - 1) + 1;
  const prefix = state.output.slice(lineStart, state.cursor).join('');
  state.preserveRaw = state.importBlock
    ? /^\s*(?:(?:[A-Za-z_]\w*|\.)\s+)?$/u.test(prefix)
    : /^\s*import\s+(?:(?:[A-Za-z_]\w*|\.)\s+)?$/u.test(prefix);
  if (!state.preserveRaw) maskGo(state); state.mode = 'raw'; return true;
}
function scanGoCode(state: GoScanState): void {
  const current = state.content[state.cursor], next = state.content[state.cursor + 1];
  if (current === '/' && (next === '/' || next === '*')) {
    maskGo(state); maskGo(state, 1); state.cursor += 1; state.mode = next === '/' ? 'line_comment' : 'block_comment';
  } else if (scanGoImportParenthesis(state, current) || scanGoRawOpening(state, current)) return;
  else if (current === '"' || current === "'") { state.mode = current === '"' ? 'double' : 'rune'; state.escaped = false; }
}
const GO_SCAN_HANDLERS: Readonly<Record<GoScanMode, (state: GoScanState) => void>> = {
  code: scanGoCode, double: (state) => scanGoQuoted(state, '"'), rune: (state) => scanGoQuoted(state, "'"),
  raw: scanGoRaw, line_comment: scanGoLineComment, block_comment: scanGoBlockComment,
};
function goImportSource(content: string): string {
  const state: GoScanState = { content, output: content.split(''), cursor: 0, mode: 'code', escaped: false,
    importBlock: false, preserveRaw: false };
  while (state.cursor < content.length) { GO_SCAN_HANDLERS[state.mode](state); state.cursor += 1; }
  return state.output.join('');
}

function goRelations(
  document: ReviewSourceDocument, modules: readonly GoModule[],
  goFilesByDirectory: ReadonlyMap<string, readonly string[]>,
): readonly ReviewMapRelation[] {
  if (!document.path.endsWith('.go')) return [];
  const output: ReviewMapRelation[] = [], lines = newlineOffsets(document.content);
  const source = goImportSource(document.content);
  const pattern = /(?:^|\n)\s*import\s+(?:(?:[A-Za-z_]\w*|\.)\s+)?(?:"([^"]+)"|`([^`]+)`)/gu;
  const blockPattern = /(?:^|\n)\s*import\s*\(([\s\S]*?)\)/gu;
  const imports = [...source.matchAll(pattern)].map((match) => ({ value: (match[1] ?? match[2]) as string,
    index: match.index + (match[0].startsWith('\n') ? 1 : 0) }))
    .concat([...source.matchAll(blockPattern)].flatMap((block) => {
      const body = block[1] as string, bodyOffset = (block[0] as string).indexOf(body);
      return [...body.matchAll(/(?:(?:[A-Za-z_]\w*|\.)\s+)?(?:"([^"]+)"|`([^`]+)`)/gu)]
        .map((match) => ({ value: (match[1] ?? match[2]) as string, index: block.index + bodyOffset + match.index }));
    }));
  for (const imported of imports) {
    const module = importedGoModule(modules, imported.value); if (!module) continue;
    const suffix = imported.value === module.name ? '' : imported.value.slice(module.name.length + 1);
    const directory = path.posix.normalize(path.posix.join(module.root, suffix));
    const candidates = goFilesByDirectory.get(directory) ?? [`${directory}/__missing__.go`];
    for (const target of candidates) output.push(relation(
      'imports', document.path, target, { extractor: 'go-module-import', confidence: 'exact',
        provenance: `${document.path}:${indexedLineNumber(lines, imported.index)}` },
    ));
  }
  return output;
}

function schemaUrl(file: string): URL { return new URL(file, 'repo:///'); }
function unfragmented(value: URL): string { const result = new URL(value); result.hash = ''; return result.href; }
function registerSchemaId(output: Map<string, string>, key: string, file: string): void {
  const existing = output.get(key);
  if (existing && existing !== file) throw new Error(`JSON Schema ID is duplicated: ${key}`);
  output.set(key, file); }
function documentSchemaIds(document: ReviewSourceDocument, output: Map<string, string>): void {
  if (!document.path.endsWith('.json')) return;
  const parsed = strictJsonObject(document.content); if (!parsed) return;
  const visit = (value: unknown, inheritedBase: URL): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const entry of value) visit(entry, inheritedBase); return; }
    const record = value as Readonly<Record<string, unknown>>;
    const base = typeof record.$id === 'string' ? new URL(record.$id, inheritedBase) : inheritedBase;
    if (typeof record.$id === 'string') registerSchemaId(output, unfragmented(base), document.path);
    for (const entry of Object.values(record)) visit(entry, base);
  };
  visit(parsed, schemaUrl(document.path));
}
function schemaIds(documents: readonly ReviewSourceDocument[]): ReadonlyMap<string, string> {
  const output = new Map<string, string>(); for (const document of documents) documentSchemaIds(document, output);
  return output; }
function schemaTarget(reference: string, base: URL, identifiers: ReadonlyMap<string, string>): string {
  const resolved = new URL(reference, base), key = unfragmented(resolved), identified = identifiers.get(key);
  if (identified) return identified;
  if (resolved.protocol === 'repo:') return decodeURIComponent(resolved.pathname.replace(/^\//u, ''));
  return `resource:schema:${key}`;
}
function jsonReferenceLines(content: string): ReadonlyMap<string, number[]> {
  const offsets = newlineOffsets(content), output = new Map<string, number[]>();
  const properties = /"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"/gu;
  for (const match of content.matchAll(properties)) {
    let key: unknown, value: unknown;
    try { key = JSON.parse(`"${match[1] as string}"`); value = JSON.parse(`"${match[2] as string}"`); }
    catch { continue; }
    if (typeof key !== 'string' || !externalJsonReference(key, value)) continue;
    const identity = `${key}\0${value}`, lines = output.get(identity) ?? [];
    lines.push(indexedLineNumber(offsets, match.index)); output.set(identity, lines);
  }
  return output;
}
function jsonReferences(
  document: ReviewSourceDocument, identifiers: ReadonlyMap<string, string>,
): readonly ReviewMapRelation[] {
  if (!document.path.endsWith('.json')) return [];
  const parsed = strictJsonObject(document.content); if (!parsed) return [];
  const output: ReviewMapRelation[] = [], lines = jsonReferenceLines(document.content);
  const visit = (value: unknown, inheritedBase: URL): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const entry of value) visit(entry, inheritedBase); return; }
    const record = value as Readonly<Record<string, unknown>>;
    const base = typeof record.$id === 'string' ? new URL(record.$id, inheritedBase) : inheritedBase;
    for (const [key, entry] of Object.entries(record)) {
      if (externalJsonReference(key, entry)) {
        const target = schemaTarget(entry, base, identifiers);
        const candidates = lines.get(`${key}\0${entry}`) ?? [], line = candidates.shift();
        if (line === undefined) throw new Error(`JSON Schema reference line is missing: ${document.path}`);
        output.push(relation('references_schema', document.path, target,
          { extractor: 'json-ref', confidence: 'exact', provenance: `${document.path}:${line}` }));
      }
      visit(entry, base);
    }
  };
  visit(parsed, schemaUrl(document.path));
  return output;
}

function externalJsonReference(key: string, value: unknown): value is string { return ['$ref', '$dynamicRef', '$recursiveRef']
  .includes(key) && typeof value === 'string' && value.length > 0 && !value.startsWith('#'); }

function lowerBound(values: readonly string[], target: string): number {
  let low = 0, high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareCodeUnits(values[middle] as string, target) < 0) low = middle + 1; else high = middle;
  }
  return low;
}

function pathAndDescendants(values: readonly string[], target: string): readonly string[] {
  if (target === '.') return values;
  const output: string[] = [];
  for (let index = lowerBound(values, target); index < values.length; index += 1) {
    const value = values[index] as string;
    if (value !== target && !value.startsWith(`${target}/`)) break;
    output.push(value);
  }
  return output;
}

function dockerSources(body: string): readonly string[] {
  if (!body.startsWith('[')) return body.split(/\s+/u).slice(0, -1);
  try {
    const values: unknown = JSON.parse(body);
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string').slice(0, -1) : [];
  } catch { return []; }
}
function dockerGlob(source: string): RegExp | undefined {
  if (/[$[]/u.test(source)) return undefined;
  const escaped = source.replace(/[.+^${}()|\\]/gu, '\\$&').replaceAll('**', '\0')
    .replaceAll('*', '[^/]*').replaceAll('?', '[^/]').replaceAll('\0', '.*');
  return new RegExp(`^${escaped}$`, 'u');
}
function dockerCandidates(source: string, root: string, trackedPaths: readonly string[]): readonly string[] {
  const direct = path.posix.normalize(path.posix.join(root, source)).replace(/\/$/u, '');
  if (!/[*?]/u.test(source)) return pathAndDescendants(trackedPaths, direct);
  const pattern = dockerGlob(direct); if (!pattern) return [];
  return trackedPaths.filter((file) => {
    let candidate = file;
    while (candidate !== '.') {
      if (pattern.test(candidate)) return true;
      const parent = path.posix.dirname(candidate); if (parent === candidate) break; candidate = parent;
    }
    return false;
  });
}

function dockerRelations(document: ReviewSourceDocument, trackedPaths: readonly string[]): readonly ReviewMapRelation[] {
  if (!/(?:^|\/)dockerfile(?:\.[^/]*)?$/iu.test(document.path)) return [];
  const output: ReviewMapRelation[] = [], offsets = newlineOffsets(document.content);
  const root = path.posix.dirname(document.path), contextRoots = [...new Set(['.', path.posix.dirname(document.path)])];
  const pattern = /^\s*(?:COPY|ADD)\s+((?:--[^\s]+\s+)*)(.+)$/gimu;
  const logicalSource = document.content.replace(/\\\r?\n/gu, (value) => ' '.repeat(value.length)); for (const match of logicalSource.matchAll(pattern)) {
    const options = match[1] as string; if (/(?:^|\s)--from=/u.test(options)) continue; const body = (match[2] as string).trim();
    for (const source of dockerSources(body)) {
      const matched = [...new Set(contextRoots.flatMap((contextRoot) => dockerCandidates(source, contextRoot, trackedPaths)))];
      const safeFallback = contextRoots.map((contextRoot) => path.posix.normalize(path.posix.join(contextRoot, source)).replace(/\/$/u, ''))
        .find((candidate) => candidate !== '..' && !candidate.startsWith('../'));
      const candidates = matched.length > 0 ? matched : [safeFallback ?? path.posix.normalize(path.posix.join(root, source))];
      for (const target of candidates) output.push(relation(
        'packages_source', document.path, target, { extractor: 'docker-copy', confidence: 'derived',
          provenance: `${document.path}:${indexedLineNumber(offsets, match.index)}` },
      ));
    }
  }
  return output;
}

function scriptRelations(document: ReviewSourceDocument, tracked: ReadonlySet<string>): readonly ReviewMapRelation[] {
  if (!/\.(?:sh|bash)$/u.test(document.path) && path.posix.basename(document.path) !== 'package.json') return [];
  const output: ReviewMapRelation[] = [], offsets = newlineOffsets(document.content);
  const pattern = /(?:^|[\s"'])((?:\.\.?\/)?[A-Za-z0-9_.\/-]+\.(?:sh|bash|mjs|mts|js|ts))(?:$|[\s"'])/gmu;
  for (const match of document.content.matchAll(pattern)) {
    const supplied = match[1] as string;
    const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(document.path), supplied));
    if (tracked.has(candidate)) output.push(relation(
      'invokes_script', document.path, candidate, { extractor: 'script-reference', confidence: 'derived',
        provenance: `${document.path}:${indexedLineNumber(offsets, match.index)}` },
    ));
  }
  return output;
}

function sensitiveBoundaryRelations(document: ReviewSourceDocument): readonly ReviewMapRelation[] {
  const output: ReviewMapRelation[] = [], offsets = newlineOffsets(document.content);
  const environmentAccess = new RegExp(`pro${'cess'}\\.env`, 'gu');
  const networkCall = new RegExp(`fet${'ch'}\\(`, 'gu');
  const patterns = [
    ['reads_secret', new RegExp(`(?:secretKeyRef|${environmentAccess.source}|secretName)\\b`, 'gu'), 'resource:secrets'],
    ['executes_command', /(?:execFile|spawn|child_process|os\/exec)\b/gu, 'resource:commands'],
    ['uses_network', new RegExp(`(?:https?:\\/\\/|\\b(?:net\\.connect|http\\.request)\\b|\\b${networkCall.source})`, 'gu'), 'resource:network'],
    ['writes_state', /(?:writeFile|rename\(|redis|persistentvolumeclaim)\b/giu, 'resource:persistence'],
  ] as const;
  for (const [type, pattern, target] of patterns) {
    const match = pattern.exec(document.content);
    pattern.lastIndex = 0;
    if (match) output.push(relation(
      type, document.path, target, { extractor: 'boundary-marker', confidence: 'uncertain',
        provenance: `${document.path}:${indexedLineNumber(offsets, match.index)}` },
    ));
  }
  return output;
}

export function extractReviewRelations(documents: readonly ReviewSourceDocument[]): readonly ReviewMapRelation[] {
  const sorted = [...documents].sort((left, right) => compareCodeUnits(left.path, right.path));
  const trackedPaths = sorted.map(({ path: file }) => file);
  const tracked = new Set(trackedPaths);
  const modules = goModules(sorted);
  const identifiers = schemaIds(sorted);
  const goFilesByDirectory = new Map<string, string[]>();
  for (const file of trackedPaths) {
    if (file.endsWith('.go')) {
      const directory = path.posix.dirname(file);
      const values = goFilesByDirectory.get(directory) ?? [];
      values.push(file); goFilesByDirectory.set(directory, values);
    }
  }
  const relations = sorted.flatMap((document) => [
    ...typescriptRelations(document, tracked),
    ...goRelations(document, modules, goFilesByDirectory),
    ...jsonReferences(document, identifiers), ...dockerRelations(document, trackedPaths),
    ...scriptRelations(document, tracked), ...sensitiveBoundaryRelations(document),
  ]).concat(extractTypeScriptAliasRelations(sorted, tracked), extractTestNameRelations(sorted));
  return Object.freeze([...new Map(relations.map((value) => [relationKey(value), value])).values()]
    .sort((left, right) => compareCodeUnits(relationKey(left), relationKey(right))));
}
