import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import ts from 'typescript';

const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/u, '')));
const cache = new Map();
function workspacePackages(root) {
  if (cache.has(root)) return cache.get(root);
  const packages = new Map();
  const manifest = path.join(root, 'package.json');
  const patterns = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).workspaces ?? [] : [];
  for (const pattern of Array.isArray(patterns) ? patterns : patterns.packages ?? []) {
    let directories = [root];
    for (const segment of pattern.split('/')) {
      directories = directories.flatMap((directory) => segment === '*'
        ? fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(directory, entry.name)) : []
        : [path.join(directory, segment)]);
    }
    for (const directory of directories) {
      const file = path.join(directory, 'package.json');
      if (!fs.existsSync(file)) continue;
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.name) packages.set(value.name, { directory, value });
    }
  }
  cache.set(root, packages);
  return packages;
}

export function pluginSourceClosure(entry, repositoryRoot) {
  const sources = new Map();
  const modules = new Map();
  const externalImports = new Set();
  const builtinImports = new Set();
  const unresolved = new Set();
  const workspaces = workspacePackages(repositoryRoot);
  function resolveLocal(candidate) {
    const choices = [candidate];
    const aliases = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts', '.ts'], '.cjs': ['.cts', '.ts'], '.jsx': ['.tsx', '.ts'] };
    choices.push(...(aliases[path.extname(candidate)] ?? []).map((extension) => candidate.slice(0, -path.extname(candidate).length) + extension));
    if (!path.extname(candidate)) choices.push(...['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.js'].map((suffix) => candidate + suffix));
    return choices.find((item) => fs.existsSync(item) && fs.statSync(item).isFile());
  }
  function exportTargets(value, mode = 'import') {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap((child) => exportTargets(child, mode));
    if (value && typeof value === 'object') {
      for (const [condition, child] of Object.entries(value)) if (['node', mode, 'default'].includes(condition)) {
        const targets = exportTargets(child, mode);
        if (targets.length) return targets;
      }
    }
    return [];
  }
  function resolveSpecifier(specifier, file, mode) {
    if (specifier.startsWith('.')) return [path.resolve(path.dirname(file), specifier)];
    if (builtins.has(specifier.replace(/^node:/u, ''))) { builtinImports.add(specifier.replace(/^node:/u, '')); return []; }
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    const workspace = workspaces.get(name);
    if (!workspace) { externalImports.add(specifier); return []; }
    const subpath = specifier === name ? '.' : `.${specifier.slice(name.length)}`;
    const exports = workspace.value.exports;
    let selected = exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith('.')) ? exports[subpath] : subpath === '.' ? exports : undefined;
    if (selected === undefined && exports && typeof exports === 'object') {
      for (const [key, value] of Object.entries(exports)) {
        if (!key.includes('*')) continue;
        const [before, after] = key.split('*');
        if (subpath.startsWith(before) && subpath.endsWith(after)) selected = exportTargets(value, mode).map((target) => target.replaceAll('*', subpath.slice(before.length, subpath.length - after.length)));
      }
    }
    const targets = exports === undefined ? [subpath === '.' ? workspace.value.main ?? './index.js' : subpath] : exportTargets(selected, mode);
    if (!targets.length) unresolved.add(`${file}: workspace export ${specifier}`);
    return targets.map((target) => path.resolve(workspace.directory, target));
  }
  function visit(candidate) {
    const file = resolveLocal(candidate);
    if (!file) { unresolved.add(candidate); return; }
    const relative = path.relative(repositoryRoot, file);
    if (relative.startsWith('../') || path.isAbsolute(relative)) { unresolved.add(candidate); return; }
    if (sources.has(file)) return file;
    const text = fs.readFileSync(file, 'utf8');
    sources.set(file, text);
    if (!/\.[cm]?[jt]sx?$/u.test(file)) return file;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const imports = new Map();
    const moduleLoaderNames = new Set(['require']);
    const requireFactories = new Set();
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && /^(?:node:)?module$/u.test(statement.moduleSpecifier.text ?? '')
        && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        for (const item of statement.importClause.namedBindings.elements) if (!item.isTypeOnly && (item.propertyName?.text ?? item.name.text) === 'createRequire') requireFactories.add(item.name.text);
      }
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        let initializer = declaration.initializer;
        while (initializer && (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer))) initializer = initializer.expression;
        if (initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && requireFactories.has(initializer.expression.text)
          && ts.isIdentifier(declaration.name)) moduleLoaderNames.add(declaration.name.text);
      }
    }
    modules.set(file, { source, imports, moduleLoaderNames });
    function follow(specifier, mode = 'import') {
      if (!ts.isStringLiteralLike(specifier)) {
        unresolved.add(`${file}:${source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1}: dynamic module`);
        return [];
      }
      const targets = resolveSpecifier(specifier.text, file, mode).map(visit).filter(Boolean);
      imports.set(`${mode}:${specifier.text}`, targets);
      if (mode === 'import' || !imports.has(specifier.text)) imports.set(specifier.text, targets);
      return targets;
    }
    function scan(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const allNamedTypes = clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((item) => item.isTypeOnly);
        if (!clause?.isTypeOnly && !allNamedTypes) follow(node.moduleSpecifier);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly
        && !(node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every((item) => item.isTypeOnly))) follow(node.moduleSpecifier);
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && moduleLoaderNames.has(node.expression.text)))) {
        if (node.arguments[0]) follow(node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'import' : 'require');
        else unresolved.add(`${file}: missing module specifier`);
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
    return file;
  }
  const entryFile = entry ? visit(entry) : undefined;
  return { sources, modules, entryFile, externalImports: [...externalImports].sort(), builtinImports: [...builtinImports].sort(), unresolved: [...unresolved].sort() };
}

// The import closure alone cannot attribute a client in an unused barrel export to
// a registration. Follow referenced declarations from that registration's export.
export function pluginInvocationFacts(closure, exportName) {
  const evidence = [];
  const externalInterfaces = [];
  const environmentInputs = [];
  const capabilityRequests = [];
  const selectedSources = new Map();
  const selectedNodes = new Map();
  const visited = new Set();
  const diagnostics = new Set();
  function hasExport(file, wanted, seen = new Set()) {
    if (!wanted) return true;
    if (seen.has(file)) return false;
    seen.add(file);
    const module = closure.modules.get(file);
    if (!module) return false;
    for (const statement of module.source.statements) {
      if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)
          && statement.exportClause.elements.some((item) => !item.isTypeOnly && item.name.text === wanted)) return true;
        if (wanted !== 'default' && !statement.exportClause && statement.moduleSpecifier && (module.imports.get(statement.moduleSpecifier.text) ?? []).some((target) => hasExport(target, wanted, new Set(seen)))) return true;
      }
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (exported && statement.name?.text === wanted) return true;
      if (exported && ts.isVariableStatement(statement) && statement.declarationList.declarations.some((item) => item.name.text === wanted)) return true;
      if (wanted === 'default' && (ts.isExportAssignment(statement) || statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))) return true;
    }
    return false;
  }
  function visit(file, wanted) {
    const module = closure.modules.get(file);
    if (!module) { if (file && !/\.json$/u.test(file)) diagnostics.add(`${file}: executable source unavailable`); return; }
    const key = `${file}:${wanted ?? '*'}`;
    if (visited.has(key)) return;
    visited.add(key);
    const { source, imports, moduleLoaderNames } = module;
    const declarations = new Map();
    const bindings = new Map();
    const roots = [];
    let forwarded = false;
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement)) {
        if (statement.importClause?.isTypeOnly) continue;
        const specifier = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (!clause) {
          const targets = imports.get(specifier) ?? [];
          if (!targets.length && !builtins.has(specifier.replace(/^node:/u, ''))) diagnostics.add(`${file}: ${closure.externalImports.includes(specifier) ? 'external' : 'unresolved'} side-effect import ${specifier} requires runtime authority`);
          for (const target of targets) visit(target);
        }
        if (clause?.name) bindings.set(clause.name.text, { specifier, name: 'default' });
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
          if (!item.isTypeOnly) bindings.set(item.name.text, { specifier, name: item.propertyName?.text ?? item.name.text });
        }
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bindings.set(clause.namedBindings.name.text, { specifier });
        continue;
      }
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        if (statement.moduleSpecifier) {
          if (statement.exportClause && ts.isNamedExports(statement.exportClause)) for (const item of statement.exportClause.elements) {
            if (!item.isTypeOnly && (!wanted || item.name.text === wanted)) for (const target of imports.get(statement.moduleSpecifier.text) ?? []) { forwarded = true; visit(target, item.propertyName?.text ?? item.name.text); }
          }
          else if (wanted !== 'default') for (const target of imports.get(statement.moduleSpecifier.text) ?? []) if (hasExport(target, wanted)) { forwarded = true; visit(target, wanted); }
        } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) for (const item of statement.exportClause.elements) {
          if (!item.isTypeOnly && (!wanted || item.name.text === wanted)) roots.push(item.propertyName ?? item.name);
        }
        continue;
      }
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
        else roots.push(declaration); // Destructuring can initialise an executable client.
      }
      else if (statement.name && ts.isIdentifier(statement.name)) declarations.set(statement.name.text, statement);
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      const defaultExport = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      if (!wanted || (exported && (statement.name?.text === wanted || (defaultExport && wanted === 'default')))) roots.push(statement);
      if (ts.isVariableStatement(statement) && exported) for (const declaration of statement.declarationList.declarations) if (declaration.name.text === wanted) roots.push(declaration);
      if (ts.isExpressionStatement(statement) || ts.isExportAssignment(statement)) roots.push(statement);
    }
    if (wanted && declarations.has(wanted)) roots.push(declarations.get(wanted));
    if (wanted && !roots.length && !forwarded) diagnostics.add(`${file}: export ${wanted} cannot be resolved`);
    const seenNodes = new Set();
    const pendingRequests = [];
    function unwrap(node) {
      while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
      return node;
    }
    // Keep expressions and their lexical initializers, never their runtime
    // values. A computed environment name is authority input even when its
    // configuration field has no token/password/secret word in its name.
    function lexicalDeclaration(node) {
      for (let scope = node.parent; scope; scope = scope.parent) {
        if (ts.isFunctionLike(scope)) {
          const parameter = scope.parameters.find((item) => ts.isIdentifier(item.name) && item.name.text === node.text);
          if (parameter) return parameter;
        }
        if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
          for (const statement of scope.statements) {
            if (ts.isFunctionDeclaration(statement) && statement.name?.text === node.text) return statement;
            if (ts.isVariableStatement(statement)) {
              const declaration = statement.declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === node.text);
              if (declaration) return declaration;
            }
          }
        }
        if (ts.isForOfStatement(scope) && ts.isVariableDeclarationList(scope.initializer)) {
          const declaration = scope.initializer.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === node.text);
          if (declaration) return { ...declaration, initializer: scope.expression };
        }
      }
    }
    function processEnvironment(node, seen = new Set()) {
      node = unwrap(node);
      if (!node || seen.has(node)) return false;
      seen.add(node);
      if ((ts.isPropertyAccessExpression(node) && node.name.text === 'env'
        || ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'env')
        && ts.isIdentifier(node.expression) && node.expression.text === 'process' && !lexicalDeclaration(node.expression)) return true;
      return ts.isIdentifier(node) && processEnvironment(lexicalDeclaration(node)?.initializer, seen);
    }
    function provenance(node, seen = new Set(), out = []) {
      if (!node || seen.has(node) || ts.isTypeNode(node)) return out;
      seen.add(node);
      if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        const declaration = lexicalDeclaration(node);
        if (declaration?.initializer && !seen.has(declaration.initializer)) {
          const initializer = declaration.initializer;
          out.push({ name: node.text, expression: initializer.getText(source), file,
            line: source.getLineAndCharacterOfPosition(initializer.getStart(source)).line + 1,
            endLine: source.getLineAndCharacterOfPosition(initializer.end - 1).line + 1 });
          provenance(initializer, seen, out);
        }
      }
      ts.forEachChild(node, (child) => { provenance(child, seen, out); });
      return out;
    }
    function requestOperations(node, seen = new Set()) {
      node = unwrap(node);
      if (!node || seen.has(node)) return [null];
      seen = new Set(seen).add(node);
      if (ts.isObjectLiteralExpression(node)) {
        const operation = node.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(source).replaceAll(/["']/gu, '') === 'operation')?.initializer;
        return operation && ts.isStringLiteralLike(operation) ? [operation.text] : [null];
      }
      if (ts.isConditionalExpression(node)) return [...requestOperations(node.whenTrue, seen), ...requestOperations(node.whenFalse, seen)];
      if (ts.isIdentifier(node)) {
        const declaration = lexicalDeclaration(node);
        if (declaration?.initializer) return requestOperations(declaration.initializer, seen);
        if (declaration && ts.isParameter(declaration) && ts.isFunctionDeclaration(declaration.parent) && declaration.parent.name) {
          const owner = declaration.parent;
          const index = owner.parameters.indexOf(declaration);
          const escaped = [...seenNodes].some((item) => ts.isIdentifier(item) && item !== owner.name && lexicalDeclaration(item) === owner
            && !(ts.isPropertyAccessExpression(item.parent) && item.parent.name === item)
            && !(ts.isCallExpression(item.parent) && item.parent.expression === item));
          if (escaped || owner.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [null];
          const callers = [...seenNodes].filter((item) => ts.isCallExpression(item) && ts.isIdentifier(item.expression) && lexicalDeclaration(item.expression) === owner);
          return callers.length ? callers.flatMap((item) => requestOperations(item.arguments[index], seen)) : [null];
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const owner = lexicalDeclaration(node.expression);
        if (owner && ts.isFunctionDeclaration(owner) && owner.body) {
          const returns = [];
          function returned(item) {
            if (ts.isReturnStatement(item)) { returns.push(item.expression); return; }
            if (ts.isFunctionLike(item)) return;
            ts.forEachChild(item, returned);
          }
          returned(owner.body);
          return returns.length ? returns.flatMap((item) => requestOperations(item, seen)) : [null];
        }
      }
      return [null];
    }
    function scan(node) {
      if (seenNodes.has(node)) return;
      seenNodes.add(node);
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const add = (kind, name) => evidence.push({ kind, name, file, line });
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && processEnvironment(node.expression)) {
        const selector = ts.isElementAccessExpression(node) ? node.argumentExpression : node.name;
        environmentInputs.push({ expression: node.getText(source), selector: selector.getText(source),
          dynamic: ts.isElementAccessExpression(node) && !ts.isStringLiteralLike(selector),
          file, line, endLine: source.getLineAndCharacterOfPosition(node.end - 1).line + 1,
          provenance: ts.isElementAccessExpression(node) ? provenance(selector) : [] });
      }
      if (ts.isIdentifier(node)) {
        if (declarations.has(node.text)) scan(declarations.get(node.text));
        const binding = bindings.get(node.text);
        if (binding) {
          const targets = imports.get(binding.specifier) ?? [];
          if (!targets.length && (binding.specifier.startsWith('.') || !closure.externalImports.includes(binding.specifier) && !builtins.has(binding.specifier.replace(/^node:/u, '')))) diagnostics.add(`${file}:${line}: unresolved runtime import ${binding.specifier}`);
          for (const target of targets) visit(target, binding.name);
        }
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expression = node.expression;
        if (expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(expression) && moduleLoaderNames.has(expression.text))) {
          const specifier = node.arguments?.[0];
          if (!specifier || !ts.isStringLiteralLike(specifier)) diagnostics.add(`${file}:${line}: dynamic module requires runtime authority`);
          else if (/^(?:ioredis|redis|@redis\/client|undici|axios|@kubernetes\/client-node)$/u.test(specifier.text)) add('client-owner', specifier.text);
          else {
            const targets = imports.get(`${expression.kind === ts.SyntaxKind.ImportKeyword ? 'import' : 'require'}:${specifier.text}`) ?? [];
            if (!targets.length && !builtins.has(specifier.text.replace(/^node:/u, ''))) {
              if (closure.externalImports.includes(specifier.text)) {
                externalInterfaces.push({ package: specifier.text, interface: '*', file, line });
                diagnostics.add(`${file}:${line}: external runtime implementation ${specifier.text} requires dependency authority`);
              } else diagnostics.add(`${file}:${line}: unresolved runtime import ${specifier.text}`);
            }
            for (const target of targets) visit(target);
          }
        }
        if (ts.isIdentifier(expression) && expression.text === 'fetch' && !declarations.has('fetch') && !bindings.has('fetch')) add('client', 'HTTP fetch');
        const receiver = ts.isPropertyAccessExpression(expression) ? expression.expression : expression;
        const binding = ts.isIdentifier(receiver) ? bindings.get(receiver.text) : undefined;
        if (binding && /^(?:node:)?(?:https?|net|tls|http2|dgram)$|^(?:ioredis|redis|@redis\/client|undici|axios|@kubernetes\/client-node)$/u.test(binding.specifier)) add('client', binding.specifier);
        else if (binding && closure.externalImports.includes(binding.specifier)) {
          externalInterfaces.push({ package: binding.specifier, interface: binding.name ?? (ts.isPropertyAccessExpression(expression) ? expression.name.text : '*'), file, line });
          diagnostics.add(`${file}:${line}: external runtime implementation ${binding.specifier} requires dependency authority`);
        }
        if (binding && /^(?:node:)?child_process$/u.test(binding.specifier)) {
          const program = node.arguments?.[0];
          const args = node.arguments?.[1];
          const localLock = program && ts.isStringLiteralLike(program) && program.text === '/usr/bin/flock'
            && args && ts.isArrayLiteralExpression(args) && args.elements.length === 7
            && args.elements.filter(ts.isStringLiteralLike).map((item) => item.text).join('\n') === "--exclusive\n--timeout\n5\n/bin/sh\n-c\nprintf 'locked\\n'; exec /bin/cat >/dev/null";
          if (localLock) add('local-process', 'fixed flock lock holder');
          else diagnostics.add(`${file}:${line}: subprocess target requires command dependency authority`);
        }
        if (ts.isPropertyAccessExpression(expression) && ['invoke', 'invokeConfidential', 'invokeCapability'].includes(expression.name.text)
          && /(?:context|reader)$/iu.test(expression.expression.getText(source))) {
          if (node.arguments?.[0] && ts.isStringLiteralLike(node.arguments[0])) {
            add('capability', node.arguments[0].text);
            pendingRequests.push({ capability: node.arguments[0].text, request: node.arguments[1], file, line });
          }
          else {
            let parent = node.parent;
            while (parent && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent) && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
            const first = parent?.parameters?.[0]?.name;
            const second = parent?.parameters?.[1]?.name;
            const forwards = first && second && ts.isIdentifier(first) && ts.isIdentifier(second)
              && node.arguments?.[0]?.getText(source) === first.text && node.arguments?.[1]?.getText(source) === second.text;
            if (forwards) add('forwarder', `${expression.name.text}: caller capability and request preserved`);
            else diagnostics.add(`${file}:${line}: dynamic invocation requires caller authority`);
          }
        }
      }
      ts.forEachChild(node, scan);
    }
    for (const node of roots) scan(node);
    for (const item of pendingRequests) for (const operation of new Set(requestOperations(item.request))) {
      const { request: _request, ...location } = item;
      capabilityRequests.push({ ...location, operation });
    }
    // A module can be reached through several named exports. Retain the union;
    // a later utility export must not erase an earlier executable owner.
    const selected = selectedNodes.get(file) ?? new Set();
    for (const node of seenNodes) if (roots.includes(node) || [...declarations.values()].includes(node)) selected.add(node);
    selectedNodes.set(file, selected);
    selectedSources.set(file, [...selected].map((node) => node.getText(source)).join('\n'));
  }
  if (closure.entryFile) visit(closure.entryFile, exportName);
  else diagnostics.add('Registration has no executable entrypoint');
  if (evidence.some((item) => item.kind === 'forwarder') && !evidence.some((item) => item.kind === 'capability')) diagnostics.add('Forwarded capability has no resolved caller authority');
  const unique = (items) => [...new Map(items.map((item) => [`${item.file}:${item.line}:${item.expression ?? `${item.capability}:${item.operation}`}`, item])).values()];
  return { evidence: [...new Map(evidence.map((item) => [`${item.file}:${item.line}:${item.kind}:${item.name}`, item])).values()], externalInterfaces, environmentInputs: unique(environmentInputs), capabilityRequests: unique(capabilityRequests), selectedSources, diagnostics: [...diagnostics].sort() };
}

// Interpret the actual host routing calls, not a package-name approximation of
// which remote client a Buster capability uses.
export function pluginCapabilityRoutes(entry, repositoryRoot) {
  const closure = pluginSourceClosure(entry, repositoryRoot);
  const module = closure.modules.get(closure.entryFile);
  if (!module) return [];
  const constructors = new Map();
  const variables = new Map();
  const calls = [];
  function scan(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const item of node.importClause.namedBindings.elements) if (!item.isTypeOnly) constructors.set(item.name.text, {
        name: item.propertyName?.text ?? item.name.text,
        files: module.imports.get(node.moduleSpecifier.text) ?? [],
      });
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) variables.set(node.name.text, node.initializer);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'set'
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'routes'
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[1] && ts.isIdentifier(node.arguments[1])) calls.push(node);
    ts.forEachChild(node, scan);
  }
  scan(module.source);
  return calls.map((call) => {
    let construction;
    function find(node) {
      if (!node || construction) return;
      if (ts.isNewExpression(node)) { construction = node; return; }
      ts.forEachChild(node, find);
    }
    const variable = call.arguments[1].text;
    find(variables.get(variable));
    const binding = construction && ts.isIdentifier(construction.expression) ? constructors.get(construction.expression.text) : undefined;
    return {
      capability: call.arguments[0].text,
      file: closure.entryFile,
      line: module.source.getLineAndCharacterOfPosition(call.getStart(module.source)).line + 1,
      variable,
      constructor: binding?.name,
      providerFiles: binding?.files ?? [],
      selector: construction?.arguments?.[0]?.getText(module.source),
    };
  });
}
