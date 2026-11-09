import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const extensions = new Set(['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx',
  '.go', '.py', '.json', '.yaml', '.yml', '.sh', '.bash', '.proto', '.c', '.h', '.cc', '.cpp', '.rs', '.sql', '.html']);
const scriptExtensions = new Set(['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);
const eventWord = /event|telemetry|observability|subscription|dead.?letter|\bXADD\b|preferenceEvent/iu;
const recordKeys = new Set(['schemaVersion', 'schema', 'version', 'v', 'recordType', 'eventType', 'eventId', 'subscriptions', 'kind', 'event']);

function readRootFile(root, file) {
  const base = fs.realpathSync(root);
  if (path.isAbsolute(file) || file.split(/[\\/]/u).includes('..')) throw new Error(`EVENT_SOURCE_OUTSIDE_ROOT:${file}`);
  const absolute = path.join(base, file);
  if (!fs.lstatSync(absolute).isFile()) throw new Error(`EVENT_SOURCE_NOT_REGULAR:${file}`);
  if (!fs.realpathSync(absolute).startsWith(base + path.sep)) throw new Error(`EVENT_SOURCE_OUTSIDE_ROOT:${file}`);
  return fs.readFileSync(absolute);
}

function sourceClass(file) {
  if (/(?:^|\/)(?:tests?|__tests__|fixtures?|testdata|benchmarks?|examples)(?:\/|\.)/u.test(file)
    || /\.(?:test|spec)\.[^.]+$/u.test(file) || /_test\.go$/u.test(file)) return 'test-fixture-or-example';
  if (/^(?:scripts\/|\.github\/)/u.test(file)) return 'maintenance-or-deployment';
  if (/^(?:handoffs\/|releases\/)/u.test(file)) return 'transition-evidence-or-release-record';
  if (/^(?:skills|contracts|plugins|tools|cmd|ops|services|src|extensions|config|charts|my-values)\//u.test(file)) {
    return 'production-or-delivered-contract';
  }
  return 'other-tracked-input-requires-activation-assessment';
}

function location(text, start, end) {
  return { start, end, line: text.slice(0, start).split('\n').length,
    endLine: text.slice(0, end).split('\n').length };
}

/**
 * Discovery is deliberately broader than qualification. An AST name or schema
 * occurrence is a candidate, never evidence of a runtime producer/consumer.
 * No runtime module is imported or evaluated. This function writes no files.
 */
export function collectEventSourceVector(root) {
  const sources = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((file) => file && !file.startsWith('docs/') && extensions.has(path.extname(file))).sort()
    .map((file) => {
      const raw = readRootFile(root, file);
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
      return { path: file, sha256: digest(raw), bytes: raw.length, classification: sourceClass(file) };
    });
  return { sources, sourceSetSha256: digest(JSON.stringify(sources.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })))) };
}

export function discoverEventCandidates(root) {
  const vector = collectEventSourceVector(root);
  const tracked = vector.sources.map((source) => source.path);
  const sources = [];
  const candidates = [];
  const excluded = [];
  const read = (file) => {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readRootFile(root, file));
  };
  for (const file of tracked) {
    if (file.startsWith('docs/') || !extensions.has(path.extname(file))) continue;
    const text = read(file);
    const classification = sourceClass(file);
    const source = { path: file, sha256: digest(Buffer.from(text)), bytes: Buffer.byteLength(text), classification };
    sources.push(source);
    const add = (kind, label, start, end, detail = {}) => {
      const span = location(text, start, end);
      const exact = text.slice(start, end);
      const entry = { id: digest(`${file}\0${kind}\0${start}\0${end}\0${exact}`), path: file,
        sourceSha256: source.sha256, kind, label, ...span, exactSha256: digest(exact),
        sourceClass: classification, ...detail };
      candidates.push(entry);
    };
    if (scriptExtensions.has(path.extname(file))) {
      const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX
        : /\.[cm]?jsx?$/u.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
      const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
      if (ast.parseDiagnostics.length) throw new Error(`EVENT_SOURCE_PARSE_FAILED:${file}:${ast.parseDiagnostics[0].start}`);
      const visit = (node) => {
        if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
          || ts.isEnumDeclaration(node) || ts.isClassDeclaration(node)
          || ts.isFunctionDeclaration(node)) && node.name) {
          add('declaration', node.name.text, node.getStart(ast), node.end,
            { syntaxKind: ts.SyntaxKind[node.kind] });
        }
        if (ts.isFunctionLike(node)) {
          add('callable-carrier', node.name?.getText(ast) ?? '<anonymous>', node.getStart(ast), node.end,
            { syntaxKind: ts.SyntaxKind[node.kind] });
        }
        if (ts.isVariableDeclaration(node)) {
          add('value-declaration-carrier', node.name.getText(ast), node.getStart(ast), node.end);
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          add('call', node.expression.getText(ast), node.getStart(ast), node.end,
            { arguments: (node.arguments ?? []).map((argument) => ({
              syntaxKind: ts.SyntaxKind[argument.kind], exactSha256: digest(argument.getText(ast)),
              ...location(text, argument.getStart(ast), argument.end) })) });
        }
        if (ts.isObjectLiteralExpression(node)) {
          const properties = node.properties.flatMap((property) => property.name
            && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            ? [property.name.text] : []);
          add('record-object', properties.join(','), node.getStart(ast), node.end,
            { properties, eventKeyHints: properties.filter((name) => recordKeys.has(name)),
              meaning: 'Every object initializer is present; hints do not decide membership or event role.' });
        }
        if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.name
          && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && recordKeys.has(node.name.text)) {
          add('record-type-member', node.name.text, node.getStart(ast), node.end,
            { declaredType: node.type?.getText(ast) ?? null });
        }
        if (ts.isStringLiteralLike(node)
          || [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind)) {
          add('literal-carrier', ts.SyntaxKind[node.kind], node.getStart(ast), node.end,
            { cookedValueSha256: digest(node.text), eventWordHint: eventWord.test(node.text),
              scriptMarkupHint: /<script\b/iu.test(node.text) });
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    } else if (file.endsWith('.json')) {
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`EVENT_JSON_PARSE_FAILED:${file}`); }
      add('json-document-carrier', typeof data?.$id === 'string' ? data.$id : 'JSON document', 0, text.length,
        { schemaDocument: file.endsWith('.schema.json') || Boolean(data?.$schema) });
      const visit = (value, pointer = '') => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          const next = `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
          if (eventWord.test(key) || recordKeys.has(key)
            || (typeof child === 'string' && eventWord.test(child))) {
            // JSON pointers bind parsed values. Never pretend that a substring
            // search supplies an unambiguous byte location for repeated keys.
            const exact = JSON.stringify(child);
            candidates.push({ id: digest(`${file}\0json\0${next}\0${exact}`), path: file,
              sourceSha256: source.sha256, sourceClass: classification, kind: 'json-value',
              label: key, pointer: next, valueSha256: digest(exact) });
          }
          visit(child, next);
        }
      };
      visit(data);
    } else {
      // Other shipped languages remain visible to the responsibility census.
      // Lexical hits are UNRESOLVED, not parsed relationships or exclusions.
      let start = 0;
      for (const line of text.split(/(?<=\n)/u)) {
        if (eventWord.test(line)) add('unresolved-language-candidate', line.trim(), start,
          start + line.length, { language: path.extname(file).slice(1),
            disposition: 'requires-source-bound-language-and-activation-assessment' });
        start += line.length;
      }
    }
    if (classification !== 'production-or-delivered-contract') excluded.push({ path: file,
      classification, sourceSha256: source.sha256,
      reason: 'Not automatically a runtime producer. Entrypoint/activation and delivered-contract assessment still required.' });
  }
  const counts = new Map();
  for (const candidate of candidates) counts.set(candidate.path, (counts.get(candidate.path) ?? 0) + 1);
  for (const source of sources) {
    source.carrierCount = counts.get(source.path) ?? 0;
    source.semanticDisposition = 'unreviewed-not-an-absence-or-activation-proof';
  }
  return { schemaVersion: 'event-discovery-census.v2-universal-carriers',
    status: 'CANDIDATES_ONLY_NOT_QUALIFIED_RELATIONSHIPS_OR_COMPLETENESS',
    sourceSetSha256: digest(JSON.stringify(sources.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })))),
    sourceSetHashMeaning: 'Ordered exact path/whole UTF8 SHA256/byte length only; independent of carrier counts and semantic classifications.',
    discoveryClassificationSha256: digest(JSON.stringify(sources)), sources, candidates, nonRuntimeCandidates: excluded,
    limits: ['All tracked supported source extensions outside docs are enumerated, including maintenance/tests as separate classes.',
      'Candidate names/calls/imports do not establish active event contracts or consumption.',
      'Script declarations, callables, values, calls, all objects and all literal/template carriers are included without an event-name/key predicate.',
      'Every JSON document is a carrier; zero-carrier sources still require explicit semantic disposition.',
      'Non-JavaScript/TypeScript syntax remains explicitly unresolved; no parser-ignorance-as-runtime-unknown.',
      'Byte/span identities for script nodes use UTF-16 character offsets; line positions and complete source SHA bind their actual source.',
      'No complete MNT-006 award until every actual production candidate and runtime import closure is qualified.'] };
}

/** Syntax-faithful declaration graph. No inferred runtime validation claims. */
export function collectDeclaredTypeGraph(root, sourcePaths) {
  const declarations = [];
  const imports = [];
  const values = [];
  for (const file of [...new Set(sourcePaths)].sort()) {
    if (!scriptExtensions.has(path.extname(file))) continue;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, file));
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (ast.parseDiagnostics.length) throw new Error(`EVENT_TYPE_PARSE_FAILED:${file}`);
    const sourceSha256 = digest(text);
    const anchor = (node) => ({ path: file, sourceSha256,
      ...location(text, node.getStart(ast), node.end), exactSha256: digest(node.getText(ast)) });
    const type = (node) => node ? { expression: node.getText(ast), syntax: ts.SyntaxKind[node.kind],
      declaredUnknown: node.kind === ts.SyntaxKind.UnknownKeyword,
      references: references(node), source: anchor(node) } : null;
    const references = (node) => {
      const found = new Set();
      const visit = (child) => {
        if (ts.isTypeReferenceNode(child)) found.add(child.typeName.getText(ast));
        if (ts.isExpressionWithTypeArguments(child)) found.add(child.expression.getText(ast));
        if (ts.isTypeQueryNode(child)) found.add(`typeof ${child.exprName.getText(ast)}`);
        if (ts.isImportTypeNode(child)) found.add(`import-type authority: ${child.getText(ast)}`);
        ts.forEachChild(child, visit);
      };
      visit(node);
      return [...found].sort();
    };
    const visitDeclaration = (statement) => {
      if (ts.isVariableDeclaration(statement) && ts.isIdentifier(statement.name) && statement.initializer) {
        values.push({ id: `${file}#${statement.name.text}@${statement.getStart(ast)}`,
          path: file, name: statement.name.text, expression: statement.initializer.getText(ast),
          syntax: ts.SyntaxKind[statement.initializer.kind], source: anchor(statement),
          meaning: 'Initializer syntax, not evaluated runtime data or an activation claim.' });
      }
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const clause = statement.importClause;
        const named = clause?.namedBindings;
        imports.push({ path: file, module: statement.moduleSpecifier.text,
          typeOnly: clause?.isTypeOnly === true, default: clause?.name?.text ?? null,
          namespace: named && ts.isNamespaceImport(named) ? named.name.text : null,
          bindings: named && ts.isNamedImports(named) ? named.elements.map((entry) => ({
            imported: entry.propertyName?.text ?? entry.name.text, local: entry.name.text,
            typeOnly: clause?.isTypeOnly === true || entry.isTypeOnly })) : [], source: anchor(statement) });
      }
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
        const members = ts.isInterfaceDeclaration(statement) ? statement.members
          : ts.isTypeLiteralNode(statement.type) ? statement.type.members : [];
        declarations.push({ id: `${file}#${statement.name.text}@${statement.getStart(ast)}`, path: file, name: statement.name.text,
          kind: ts.isInterfaceDeclaration(statement) ? 'interface' : 'type-alias',
          exported: statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false,
          typeParameters: statement.typeParameters?.map((parameter) => parameter.getText(ast)) ?? [],
          heritage: ts.isInterfaceDeclaration(statement)
            ? statement.heritageClauses?.map((clause) => clause.getText(ast)) ?? [] : [],
          type: ts.isTypeAliasDeclaration(statement) ? type(statement.type) : null,
          references: references(statement),
          members: members.map((member) => ({ name: member.name?.getText(ast) ?? null,
            staticName: member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) || ts.isNumericLiteral(member.name)) ? member.name.text : null,
            syntax: ts.SyntaxKind[member.kind], optional: Boolean(member.questionToken),
            readonly: member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false,
            type: 'type' in member ? type(member.type) : null,
            expression: member.getText(ast), source: anchor(member) })), source: anchor(statement) });
      }
      ts.forEachChild(statement, visitDeclaration);
    };
    visitDeclaration(ast);
  }
  return { declarations, imports, values,
    meaning: 'Exact TypeScript declarations and type-only import bindings, not an asserted runtime validator or active consumer.' };
}

export function collectRecordConstructors(root, sourcePaths) {
  const constructors = [];
  for (const file of [...new Set(sourcePaths)].sort()) {
    if (!scriptExtensions.has(path.extname(file))) continue;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, file));
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (ast.parseDiagnostics.length) throw new Error(`EVENT_CONSTRUCTOR_PARSE_FAILED:${file}`);
    const sourceSha256 = digest(text);
    const anchor = (node) => ({ path: file, sourceSha256,
      ...location(text, node.getStart(ast), node.end), exactSha256: digest(node.getText(ast)) });
    const properties = (object) => object.properties.map((property) => ({
      kind: ts.SyntaxKind[property.kind], name: property.name?.getText(ast) ?? null,
      staticName: property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) ? property.name.text : null,
      expression: ts.isPropertyAssignment(property) ? property.initializer.getText(ast)
        : ts.isShorthandPropertyAssignment(property) ? property.name.text : property.getText(ast),
      literal: ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)
        ? property.initializer.text : null,
      source: anchor(property),
    }));
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const fields = properties(node);
        const discriminators = fields.filter((field) => field.name
          && recordKeys.has(field.name.replace(/^['"]|['"]$/gu, '')));
        let owner = node.parent;
        while (owner && !ts.isFunctionLike(owner) && !ts.isSourceFile(owner)) owner = owner.parent;
        constructors.push({ id: `${file}@${node.getStart(ast)}`, source: anchor(node),
          fields, discriminators,
          enclosingFunction: owner && !ts.isSourceFile(owner) ? anchor(owner) : null,
          meaning: 'Every object initializer in the supplied complete Source responsibility, regardless of field names. Discriminators are hints only, not record/active-role membership.' });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return constructors;
}

/** Selected owning sources' complete call syntax; call arguments retain actual
 * type/payload construction and computed expressions, without runtime inference. */
export function collectOwnedCallSyntax(root, sourcePaths) {
  const calls = [];
  for (const file of [...new Set(sourcePaths)].sort()) {
    if (!scriptExtensions.has(path.extname(file))) continue;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, file));
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (ast.parseDiagnostics.length) throw new Error(`EVENT_CALL_SYNTAX_PARSE_FAILED:${file}`);
    const sourceSha256 = digest(text);
    const visit = (node) => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) calls.push({
        expression: node.expression.getText(ast), syntax: node.getText(ast), optionalCall: Boolean(node.questionDotToken),
        arguments: (node.arguments ?? []).map((argument) => argument.getText(ast)),
        source: { path: file, sourceSha256, ...location(text, node.getStart(ast), node.end), exactSha256: digest(node.getText(ast)) },
      });
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return calls;
}

/** Lexical Go declaration body only. This preserves the complete construction
 * source where no local JSON/TS payload schema exists; it is not a Go type
 * inference engine and never labels an external callback payload closed. */
export function collectGoDeclarationBodies(root, selectors) {
  return selectors.map(({ path: file, selector }) => {
    if (!file.endsWith('.go') || !selector.startsWith('func ')) throw new Error(`EVENT_GO_DECLARATION_SELECTOR_UNSUPPORTED:${file}`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, file));
    const start = text.indexOf(selector);
    if (start < 0 || text.indexOf(selector, start + selector.length) >= 0) throw new Error(`EVENT_GO_DECLARATION_NOT_UNIQUE:${file}:${selector}`);
    let state = 'code'; let depth = 0; let opened = false;
    let parameterDepth = 0; let typeDepth = 0; let previousWord = null;
    for (let i = start; i < text.length; i++) {
      const character = text[i]; const next = text[i + 1];
      if (state === 'line') { if (character === '\n') state = 'code'; continue; }
      if (state === 'block') { if (character === '*' && next === '/') { state = 'code'; i++; } continue; }
      if (state === '`') { if (character === '`') state = 'code'; continue; }
      if (state === '"' || state === "'") {
        if (character === '\\') i++;
        else if (character === state) state = 'code';
        continue;
      }
      if (character === '/' && next === '/') { state = 'line'; i++; continue; }
      if (character === '/' && next === '*') { state = 'block'; i++; continue; }
      if (['"', "'", '`'].includes(character)) { state = character; continue; }
      if (!opened && /[A-Za-z_]/u.test(character)) {
        let end = i + 1;
        while (end < text.length && /[A-Za-z0-9_]/u.test(text[end])) end++;
        previousWord = text.slice(i, end); i = end - 1; continue;
      }
      if (!opened && character === '(') { parameterDepth++; previousWord = null; continue; }
      if (!opened && character === ')') { parameterDepth--; previousWord = null; continue; }
      if (!opened && character === '{' && (parameterDepth > 0 || typeDepth > 0 || ['struct', 'interface'].includes(previousWord))) {
        typeDepth++; previousWord = null; continue;
      }
      if (!opened && character === '}' && typeDepth > 0) { typeDepth--; previousWord = null; continue; }
      if (character === '{') { opened = true; depth++; }
      if (!opened && !/\s/u.test(character)) previousWord = null;
      if (character === '}' && opened && --depth === 0) return {
        source: { path: file, sourceSha256: digest(text), ...location(text, start, i + 1), exactSha256: digest(text.slice(start, i + 1)) },
        expression: text.slice(start, i + 1),
        meaning: 'Complete balanced lexical Go declaration body; no invented payload type, validator, version or runtime activation.',
      };
    }
    throw new Error(`EVENT_GO_DECLARATION_UNCLOSED:${file}:${selector}`);
  });
}

/** Static embedded browser code is a separate producer surface, not TS data. */
export function collectEmbeddedScriptSyntax(root, sourcePaths) {
  const scripts = [];
  const incomplete = [];
  for (const file of [...new Set(sourcePaths)].sort()) {
    if (!scriptExtensions.has(path.extname(file))) continue;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, file));
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        || [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind)) {
        const cooked = node.text;
        if (/<script\b/iu.test(cooked)) {
          const origin = { path: file, sourceSha256: digest(text),
            ...location(text, node.getStart(ast), node.end), exactSha256: digest(node.getText(ast)) };
          let complete = 0;
          for (const match of cooked.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
            complete++;
            const attributes = match[1];
            const code = match[2];
            const parsed = ts.createSourceFile(`${file}.embedded.js`, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
            const source = (entry) => ({ scriptStart: entry.getStart(parsed), scriptEnd: entry.end,
              ...location(code, entry.getStart(parsed), entry.end), exactSha256: digest(entry.getText(parsed)) });
            const calls = [];
            const objects = [];
            const walk = (entry) => {
              if (ts.isCallExpression(entry)) calls.push({ expression: entry.expression.getText(parsed),
                arguments: entry.arguments.map((argument) => argument.getText(parsed)), source: source(entry) });
              if (ts.isObjectLiteralExpression(entry)) objects.push({ fields: entry.properties.map((property) => ({
                kind: ts.SyntaxKind[property.kind], name: property.name?.getText(parsed) ?? null,
                expression: ts.isPropertyAssignment(property) ? property.initializer.getText(parsed) : property.getText(parsed),
                literal: ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)
                  ? property.initializer.text : null })), source: source(entry) });
              ts.forEachChild(entry, walk);
            };
            if (!parsed.parseDiagnostics.length) walk(parsed);
            scripts.push({ origin, attributes, cookedScript: code, cookedScriptSha256: digest(code),
              status: parsed.parseDiagnostics.length ? 'embedded-syntax-requires-qualified-parser' : 'parsed-static-script',
              calls, objects,
              coordinateMeaning: 'Inner positions/lines are relative to complete cooked script, NOT original source offsets. Origin binds the complete original literal token.',
              meaning: 'Embedded producer/receiver candidates only; HTML context and actual activation must be independently qualified.' });
          }
          const openings = [...cooked.matchAll(/<script\b/giu)].length;
          if (complete !== openings) incomplete.push({ origin,
            status: 'script-crosses-template-boundary-or-incomplete-markup',
            meaning: 'No synthetic interpolation replacement or silently truncated script is parsed.' });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return { scripts, incomplete };
}

function pointerValue(document, fragment, file) {
  if (fragment === '') return document;
  if (!fragment.startsWith('/')) throw new Error(`EVENT_SCHEMA_NON_POINTER_ANCHOR:${file}#${fragment}`);
  let value = document;
  for (const token of fragment.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, token)) {
      throw new Error(`EVENT_SCHEMA_DANGLING_REFERENCE:${file}#${fragment}`);
    }
    value = value[token];
  }
  return value;
}

/** Preserve recursive/nullable/conditional schema facts without flattening them. */
export function collectSchemaGraph(root, entryFiles) {
  const documents = new Map();
  const references = [];
  const queue = [...new Set(entryFiles)].sort();
  while (queue.length) {
    const file = queue.shift();
    if (documents.has(file)) continue;
    if (path.isAbsolute(file) || file.split('/').includes('..')) throw new Error(`EVENT_SCHEMA_OUTSIDE_ROOT:${file}`);
    const raw = readRootFile(root, file);
    const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    documents.set(file, { path: file, sha256: digest(raw), document });
    const visit = (node, pointer = '') => {
      if (!node || typeof node !== 'object') return;
      if ((pointer !== '' && Object.hasOwn(node, '$id'))
        || Object.hasOwn(node, '$dynamicRef') || Object.hasOwn(node, '$recursiveRef')) {
        throw new Error(`EVENT_SCHEMA_SCOPED_REFERENCE_RESOLVER_REQUIRED:${file}#${pointer}`);
      }
      if (typeof node.$ref === 'string') {
        const [target, encodedFragment = ''] = node.$ref.split('#');
        const fragment = decodeURIComponent(encodedFragment);
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(target)) {
          // External schema URIs need the owning runtime registry. Do not
          // silently fetch or replace their meaning with a guessed local file.
          references.push({ from: file, pointer, reference: node.$ref,
            status: 'external-registry-resolution-required' });
        } else {
          const resolved = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target)) : file;
          if (path.isAbsolute(resolved) || resolved.split('/').includes('..')) throw new Error(`EVENT_SCHEMA_OUTSIDE_ROOT:${resolved}`);
          const targetDocument = resolved === file ? document
            : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, resolved)));
          pointerValue(targetDocument, fragment, resolved);
          references.push({ from: file, pointer, reference: node.$ref, target: resolved,
            targetPointer: fragment, status: 'resolved-local-schema' });
          if (!documents.has(resolved)) queue.push(resolved);
        }
      }
      for (const [key, child] of Object.entries(node)) visit(child,
        `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    };
    visit(document);
  }
  return { documents: [...documents.values()].sort((a, b) => a.path.localeCompare(b.path)), references,
    meaning: 'Complete selected JSON Schema documents and reference edges; runtime selection/activation is qualified separately.' };
}

function exportTarget(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  // This is a type-resolution graph, not runtime conditional-export activation.
  for (const condition of ['types', 'import', 'node', 'default']) {
    if (Object.hasOwn(value, condition)) {
      const target = exportTarget(value[condition]);
      if (target) return target;
    }
  }
  return null;
}

/** Actual local package export bindings for declared-type resolution only. */
export function collectLocalPackageTypeBindings(root, census) {
  const paths = {};
  const packageBindings = [];
  for (const source of census.sources) {
    if (!source.path.endsWith('/package.json') || source.classification !== 'production-or-delivered-contract') continue;
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, source.path)));
    if (typeof manifest.name !== 'string') continue;
    const directory = path.posix.dirname(source.path);
    const exported = manifest.exports;
    const entries = typeof exported === 'string' ? [['.', exported]]
      : exported && typeof exported === 'object' && !Array.isArray(exported)
        ? Object.keys(exported).some((key) => key.startsWith('.')) ? Object.entries(exported) : [['.', exported]] : [];
    for (const [subpath, value] of entries) {
      const target = exportTarget(value);
      if (!target || !target.startsWith('./')) continue;
      const key = manifest.name + (subpath === '.' ? '' : subpath.slice(1));
      if (Object.hasOwn(paths, key)) throw new Error(`EVENT_AMBIGUOUS_PACKAGE_EXPORT:${key}`);
      const resolved = path.posix.join(directory, target);
      if (path.posix.isAbsolute(resolved) || resolved.split('/').includes('..')) throw new Error(`EVENT_PACKAGE_EXPORT_OUTSIDE_ROOT:${source.path}:${target}`);
      paths[key] = [resolved];
      packageBindings.push({ specifier: key, source: source.path, sourceSha256: source.sha256,
        target: paths[key][0], purpose: 'local declared type export, not active runtime-consumer evidence' });
    }
  }
  return packageBindings;
}

/** Resolve all local call signatures, including aliases and private appenders. */
export function collectSourceCallGraph(root, census) {
  const packageBindings = collectLocalPackageTypeBindings(root, census);
  const paths = Object.fromEntries(packageBindings.map((binding) => [binding.specifier, [binding.target]]));
  const inputs = census.sources.filter((source) => scriptExtensions.has(path.extname(source.path))
    && ['production-or-delivered-contract', 'maintenance-or-deployment'].includes(source.classification));
  const program = ts.createProgram(inputs.map((source) => path.join(root, source.path)), {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, allowJs: true,
    allowImportingTsExtensions: true, resolveJsonModule: true, skipLibCheck: true,
    noEmit: true, baseUrl: root, paths, jsx: ts.JsxEmit.Preserve,
  });
  const checker = program.getTypeChecker();
  const inputSet = new Set(inputs.map((source) => source.path));
  const calls = [];
  const sourceAnchor = (node) => {
    const source = node.getSourceFile();
    const relative = path.relative(root, source.fileName).split(path.sep).join('/');
    const start = node.getStart(source);
    return { path: relative, ...location(source.text, start, node.end),
      exactSha256: digest(node.getText(source)), localInput: inputSet.has(relative) };
  };
  for (const source of program.getSourceFiles()) {
    const relative = path.relative(root, source.fileName).split(path.sep).join('/');
    if (!inputSet.has(relative)) continue;
    const visit = (node) => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const signature = checker.getResolvedSignature(node);
        const declaration = signature?.getDeclaration();
        const symbol = checker.getSymbolAtLocation(node.expression);
        let owner = node.parent;
        while (owner && !ts.isFunctionLike(owner) && !ts.isSourceFile(owner)) owner = owner.parent;
        const anchor = sourceAnchor(node);
        calls.push({ id: digest(`${relative}\0${anchor.start}\0${anchor.end}\0${anchor.exactSha256}`),
          caller: anchor, expression: node.expression.getText(source),
          enclosingFunction: owner && !ts.isSourceFile(owner) ? sourceAnchor(owner) : null,
          resolvedSignature: declaration ? sourceAnchor(declaration) : null,
          symbolDeclarations: symbol?.declarations?.map(sourceAnchor) ?? [],
          resolution: declaration ? 'typescript-signature-location-only' : 'unresolved-call-requires-assessment',
          meaning: 'Call target/type location only; no automatic event role, runtime execution or consumer assertion.' });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { schemaVersion: 'source-call-location-graph.v1', sourceSetSha256: census.sourceSetSha256,
    toolchain: { typescript: ts.version, node: process.version }, packageBindings, calls,
    limits: ['Type resolution is not runtime activation or event consumption.',
      'Unresolved calls remain explicit; no dynamic target is fabricated.',
      'External declarations are distinguishable from tracked local inputs.',
      'No code imported from the scanned runtime and no compiler output emitted.'] };
}

const intrinsicTypes = new Set(['Record', 'Readonly', 'ReadonlyArray', 'Array', 'Map', 'ReadonlyMap',
  'Set', 'ReadonlySet', 'Promise', 'Partial', 'Required', 'Pick', 'Omit', 'Exclude', 'Extract',
  'NonNullable', 'ReturnType', 'Parameters', 'Uint8Array', 'Buffer', 'Date', 'Error', 'AbortSignal']);

/** Follow real local imports/barrel exports; never choose a type by global name. */
export function selectDeclaredTypeClosure(root, graph, packageBindings, roots) {
  const paths = Object.fromEntries(packageBindings.map((binding) => [binding.specifier, [binding.target]]));
  const options = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    baseUrl: root, paths, allowImportingTsExtensions: true, allowJs: true };
  const modules = new Map();
  const declarations = new Map();
  const values = new Map();
  const edges = [];
  const moduleFile = (specifier, owner) => {
    const found = ts.resolveModuleName(specifier, path.join(root, owner), options, ts.sys).resolvedModule;
    if (!found) throw new Error(`EVENT_TYPE_IMPORT_UNRESOLVED:${owner}:${specifier}`);
    const relative = path.relative(root, found.resolvedFileName).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative) || relative.includes('/node_modules/')) {
      throw new Error(`EVENT_PAYLOAD_TYPE_EXTERNAL_AUTHORITY_REQUIRED:${owner}:${specifier}`);
    }
    return relative;
  };
  const sourceModule = (file) => {
    if (!modules.has(file)) {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(readRootFile(root, file));
      const ast = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
      if (ast.parseDiagnostics.length) throw new Error(`EVENT_TYPE_SOURCE_PARSE_FAILED:${file}`);
      modules.set(file, ast);
    }
    return modules.get(file);
  };
  const resolve = (file, name, isValue = false, seen = new Set()) => {
    const key = `${file}#${isValue ? 'typeof ' : ''}${name}`;
    if (seen.has(key)) return [];
    const nextSeen = new Set(seen).add(key);
    const local = (isValue ? graph.values : graph.declarations)
      .filter((entry) => entry.path === file && entry.name === name);
    if (local.length) {
      if (local.length !== 1) throw new Error(`EVENT_TYPE_LEXICAL_SELECTOR_REQUIRED:${key}`);
      return [{ kind: isValue ? 'value' : 'type', entry: local[0] }];
    }
    const pieces = name.split('.');
    for (const imported of graph.imports.filter((entry) => entry.path === file)) {
      if (pieces.length > 1 && imported.namespace === pieces[0]) {
        return resolve(moduleFile(imported.module, file), pieces.slice(1).join('.'), isValue, nextSeen);
      }
      const binding = imported.bindings.find((entry) => entry.local === name);
      if (binding) return resolve(moduleFile(imported.module, file), binding.imported, isValue, nextSeen);
    }
    const matches = [];
    for (const statement of sourceModule(file).statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? moduleFile(statement.moduleSpecifier.text, file) : file;
      if (!statement.exportClause) matches.push(...resolve(target, name, isValue, nextSeen));
      else if (ts.isNamedExports(statement.exportClause)) {
        for (const item of statement.exportClause.elements) if (item.name.text === name) {
          matches.push(...resolve(target, item.propertyName?.text ?? item.name.text, isValue, nextSeen));
        }
      }
    }
    return [...new Map(matches.map((match) => [match.entry.id, match])).values()];
  };
  const queue = roots.map((entry) => ({ ...entry, parent: null }));
  while (queue.length) {
    const request = queue.shift();
    const shadowsIntrinsic = graph.declarations.some((entry) => entry.path === request.path && entry.name === request.name)
      || graph.imports.some((entry) => entry.path === request.path && entry.bindings.some((binding) => binding.local === request.name));
    if (intrinsicTypes.has(request.name) && !request.value && !shadowsIntrinsic) {
      edges.push({ from: request.parent, reference: request.name, kind: 'typescript-intrinsic-type-operator' });
      continue;
    }
    const matches = resolve(request.path, request.name, Boolean(request.value));
    if (matches.length !== 1) throw new Error(`EVENT_PAYLOAD_REFERENCE_NOT_UNIQUE:${request.path}:${request.name}:${matches.length}`);
    const match = matches[0];
    edges.push({ from: request.parent, reference: request.name, kind: match.kind, target: match.entry.id });
    if (match.kind === 'value') {
      values.set(match.entry.id, match.entry);
      continue;
    }
    if (declarations.has(match.entry.id)) continue;
    declarations.set(match.entry.id, match.entry);
    const parameters = new Set(match.entry.typeParameters.map((parameter) => /^\s*([\w$]+)/u.exec(parameter)?.[1]));
    for (const reference of match.entry.references) {
      if (parameters.has(reference)) {
        edges.push({ from: match.entry.id, reference, kind: 'declared-generic-type-parameter' });
      } else {
        const value = reference.startsWith('typeof ');
        queue.push({ path: match.entry.path, name: value ? reference.slice(7) : reference,
          value, parent: match.entry.id });
      }
    }
  }
  return { declarations: [...declarations.values()], values: [...values.values()], edges,
    limits: ['TypeScript declarations describe declared types, not additional runtime validators.',
      'Intrinsic operators and generic parameters remain explicit; no unbounded extension payload is made closed.',
      'Unresolved, external or ambiguous payload authorities fail rather than selecting an unrelated same-named declaration.'] };
}
