#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import YAML from 'yaml';

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);
const WORKLOAD_KINDS = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);

function lineAt(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function sourceInputs(inputs, options = {}) {
  const list = Array.isArray(inputs) ? inputs : inputs && typeof inputs === 'object' && !('text' in inputs)
    ? Object.entries(inputs).map(([source, text]) => ({ source, text })) : [inputs];
  return list.filter(Boolean).map((entry, index) => {
    if (typeof entry === 'object') {
      const source = entry.source ?? entry.file ?? `<source-${index + 1}>`;
      return { source, origin: entry.origin ?? source, text: entry.text ?? entry.code ?? fs.readFileSync(source, 'utf8') };
    }
    if (options.sourceText === true || !fs.existsSync(entry)) return { source: `<source-${index + 1}>`, origin: options.origin ?? '<memory>', text: entry };
    return { source: entry, origin: entry, text: fs.readFileSync(entry, 'utf8') };
  });
}

function functionName(node, sourceFile) {
  if (node.name?.getText(sourceFile)) return node.name.getText(sourceFile);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && parent.name) return parent.name.getText(sourceFile);
    if (ts.isCallExpression(parent)) return `${parent.expression.getText(sourceFile)} handler`;
  }
  return '<anonymous handler>';
}

function isHandler(node, sourceFile) {
  if (!(ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node))) return false;
  const parameters = node.parameters.map((parameter) => parameter.name.getText(sourceFile).toLowerCase());
  const hasRequest = parameters.some((name) => /^(?:request|req)$/u.test(name));
  const hasResponse = parameters.some((name) => /^(?:response|res)$/u.test(name));
  if (hasRequest && hasResponse) return true;
  const body = node.body?.getText(sourceFile) ?? '';
  if (hasRequest && /(?:\.writeHead\s*\(|\.end\s*\(|\bjson\s*\(\s*(?:response|res)\b)/u.test(body)) return true;
  return hasRequest && parameters.some((name) => /^(?:json|send|reply)$/u.test(name))
    && /(?:url\.pathname|(?:request|req)\.url)/u.test(body) && /(?:request|req)\.method/u.test(body);
}

function isPathExpression(node, sourceFile) {
  const text = node.getText(sourceFile).replaceAll(/\s/gu, '');
  return /^(?:url\.pathname|(?:request|req)\.url(?:\?\?['"]{2})?)$/u.test(text);
}

function isMethodExpression(node, sourceFile) {
  return /^(?:request|req)\.method$/u.test(node.getText(sourceFile).replaceAll(/\s/gu, ''));
}

function stringValue(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}

function binaryComparisons(node, sourceFile, result = []) {
  if (!node) return result;
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(operator)) {
      const leftString = stringValue(node.left);
      const rightString = stringValue(node.right);
      const expression = leftString === undefined ? node.left : node.right;
      const value = leftString ?? rightString;
      if (value !== undefined) result.push({ expression, value, equal: operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken, node });
    }
    binaryComparisons(node.left, sourceFile, result);
    binaryComparisons(node.right, sourceFile, result);
  } else if (ts.isPrefixUnaryExpression(node) || ts.isParenthesizedExpression(node)) binaryComparisons(node.operand ?? node.expression, sourceFile, result);
  else node.forEachChild((child) => binaryComparisons(child, sourceFile, result));
  return result;
}

function conditionMethods(node, sourceFile, invert = false) {
  return binaryComparisons(node, sourceFile).flatMap(({ expression, value, equal }) =>
    isMethodExpression(expression, sourceFile) && HTTP_METHODS.has(value) && (invert ? !equal : equal) ? [value] : []);
}

function exactPaths(node, sourceFile, invert = false) {
  return binaryComparisons(node, sourceFile).flatMap(({ expression, value, equal, node: comparison }) =>
    isPathExpression(expression, sourceFile) && value.startsWith('/') && (invert ? !equal : equal) ? [{ path: value, node: comparison }] : []);
}

function includedPaths(node, sourceFile) {
  const result = [];
  function visit(child) {
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === 'includes'
      && ts.isArrayLiteralExpression(child.expression.expression) && child.arguments.some((argument) => isPathExpression(argument, sourceFile))) {
      for (const element of child.expression.expression.elements) {
        const value = stringValue(element);
        if (value?.startsWith('/')) result.push({ path: value, node: element });
      }
    }
    child.forEachChild(visit);
  }
  visit(node);
  return result;
}

function terminalStatement(statement) {
  if (!statement) return false;
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(terminalStatement);
  if (ts.isExpressionStatement(statement)) return /\.(?:end|destroy)\s*\(/u.test(statement.getText());
  return false;
}

function startsWithGuards(handler, sourceFile) {
  const guards = [];
  function visit(node) {
    if (node !== handler && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    if (ts.isIfStatement(node) && terminalStatement(node.thenStatement)) {
      let condition = node.expression;
      let negated = false;
      while (ts.isParenthesizedExpression(condition)) condition = condition.expression;
      if (ts.isPrefixUnaryExpression(condition) && condition.operator === ts.SyntaxKind.ExclamationToken) {
        negated = true;
        condition = condition.operand;
        while (ts.isParenthesizedExpression(condition)) condition = condition.expression;
      }
      if (negated && ts.isCallExpression(condition) && ts.isPropertyAccessExpression(condition.expression)
        && condition.expression.name.text === 'startsWith' && isPathExpression(condition.expression.expression, sourceFile)) {
        const prefix = stringValue(condition.arguments[0]);
        if (prefix?.startsWith('/')) guards.push({ prefix, line: lineAt(sourceFile, node), text: node.expression.getText(sourceFile) });
      }
    }
    node.forEachChild(visit);
  }
  handler.forEachChild(visit);
  return guards;
}

function positivePrefixBoundary(statement, sourceFile) {
  if (!ts.isIfStatement(statement) || !statement.elseStatement) return undefined;
  let condition = statement.expression;
  while (ts.isParenthesizedExpression(condition)) condition = condition.expression;
  if (ts.isPrefixUnaryExpression(condition) && condition.operator === ts.SyntaxKind.ExclamationToken) return undefined;
  if (!ts.isCallExpression(condition) || !ts.isPropertyAccessExpression(condition.expression)
    || condition.expression.name.text !== 'startsWith' || !isPathExpression(condition.expression.expression, sourceFile)) return undefined;
  const prefix = stringValue(condition.arguments[0]);
  if (!prefix?.startsWith('/') || !prefix.endsWith('/')) return undefined;
  const forwardingHelpers = new Set();
  function findHelpers(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.body) {
      const name = outboundFunctionName(node, sourceFile);
      const parameters = node.parameters.map((parameter) => parameter.name.getText(sourceFile));
      const body = node.body.getText(sourceFile);
      if (name && parameters.some((parameter) => /^(?:request|req)$/u.test(parameter))
        && parameters.some((parameter) => /^(?:response|res)$/u.test(parameter))
        && /\bfetch\s*\(/u.test(body) && /(?:response|res)\.(?:statusCode|writeHead|setHeader|write|end|pipe)/u.test(body)) forwardingHelpers.add(name);
    }
    node.forEachChild(findHelpers);
  }
  findHelpers(sourceFile);
  let forwards = false;
  function inspect(node) {
    if (node !== statement.thenStatement && ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const argumentsUsed = new Set(node.arguments.map((argument) => argument.getText(sourceFile)));
      if ([...argumentsUsed].some((argument) => /^(?:request|req)$/u.test(argument))
        && [...argumentsUsed].some((argument) => /^(?:response|res)$/u.test(argument))
        && forwardingHelpers.has(outboundCalleeName(node.expression, sourceFile))) forwards = true;
    }
    if (!forwards) node.forEachChild(inspect);
  }
  inspect(statement.thenStatement);
  if (!forwards || !/(?:request|req|response|res)/u.test(statement.elseStatement.getText(sourceFile))) return undefined;
  return { prefix, node: condition };
}

function staticResponseHelpers(sourceFile) {
  const helpers = new Set();
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      const name = outboundFunctionName(node, sourceFile);
      const parameters = node.parameters.map((parameter) => parameter.name.getText(sourceFile));
      const body = node.body.getText(sourceFile);
      const receivesResponse = parameters.some((parameter) => /^(?:response|res)$/u.test(parameter));
      const readsFilesystem = /\b(?:open|readFile|createReadStream|stat)\s*\(/u.test(body);
      const streamsResponse = /(?:\bpipeline\s*\([\s\S]*?\b(?:response|res)\b|(?:response|res)\.(?:write|end|pipe)\s*\()/u.test(body);
      if (name && receivesResponse && readsFilesystem && streamsResponse) helpers.add(name);
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return helpers;
}

function callsResponseHelper(node, sourceFile, helpers) {
  let found = false;
  function visit(child) {
    if (child !== node && ts.isFunctionLike(child)) return;
    if (ts.isCallExpression(child) && helpers.has(outboundCalleeName(child.expression, sourceFile))
      && child.arguments.some((argument) => /^(?:response|res)$/u.test(argument.getText(sourceFile)))) found = true;
    if (!found) child.forEachChild(visit);
  }
  visit(node);
  return found;
}

function staticFallbackBoundary(statement, handler, sourceFile, helpers) {
  const boundary = positivePrefixBoundary(statement, sourceFile);
  if (!boundary || !callsResponseHelper(statement.elseStatement, sourceFile, helpers)) return undefined;
  const excludedPaths = [];
  const block = directStatementInBlock(statement, handler.body);
  if (block && ts.isBlock(handler.body)) {
    const index = handler.body.statements.indexOf(block);
    for (const prior of handler.body.statements.slice(0, index)) {
      if (!ts.isIfStatement(prior) || !terminalStatement(prior.thenStatement)) continue;
      for (const exact of exactPaths(prior.expression, sourceFile)) {
        if (!excludedPaths.includes(exact.path)) excludedPaths.push(exact.path);
      }
    }
  }
  return { ...boundary, excludedPaths: excludedPaths.sort(), excludedPrefixes: [boundary.prefix] };
}

function isImmediatelyInvokedFunction(node) {
  let parent = node.parent;
  while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return ts.isCallExpression(parent)
    && (parent.expression === node || (ts.isParenthesizedExpression(parent.expression) && parent.expression.expression === node));
}

function rejectedMethodGuards(handler, sourceFile) {
  const guards = [];
  function visit(node) {
    if (node !== handler && ts.isFunctionLike(node)) return;
    if (ts.isIfStatement(node) && terminalStatement(node.thenStatement)) {
      for (const method of conditionMethods(node.expression, sourceFile, true)) {
        guards.push({ method, line: lineAt(sourceFile, node), text: node.expression.getText(sourceFile) });
      }
    }
    node.forEachChild(visit);
  }
  handler.forEachChild(visit);
  return guards;
}

function regexBindings(handler, sourceFile) {
  const result = new Map();
  function visit(node) {
    if (node !== handler && ts.isFunctionLike(node) && !isImmediatelyInvokedFunction(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isPropertyAccessExpression(node.initializer.expression) && node.initializer.expression.name.text === 'exec'
      && ts.isRegularExpressionLiteral(node.initializer.expression.expression)
      && node.initializer.arguments.some((argument) => isPathExpression(argument, sourceFile))) {
      const literal = node.initializer.expression.expression.text;
      const lastSlash = literal.lastIndexOf('/');
      result.set(node.name.text, { source: literal.slice(1, lastSlash), flags: literal.slice(lastSlash + 1), node });
    }
    node.forEachChild(visit);
  }
  handler.forEachChild(visit);
  return result;
}

function helperRouteParsers(sourceFile) {
  const helpers = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.parameters.length >= 1) {
      const parameter = node.parameters[0].name.getText(sourceFile);
      function inspect(child) {
        if (child !== node && ts.isFunctionLike(child)) return;
        if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
          && ['match', 'exec'].includes(child.expression.name.text)) {
          const regex = child.expression.name.text === 'match' ? child.arguments[0] : child.expression.expression;
          const receiver = child.expression.name.text === 'match' ? child.expression.expression : child.arguments[0];
          if (ts.isRegularExpressionLiteral(regex) && receiver?.getText(sourceFile).includes(parameter)) {
            const literal = regex.text;
            const lastSlash = literal.lastIndexOf('/');
            const regexSource = literal.slice(1, lastSlash);
            if (regexSource.startsWith('^') && regexSource.endsWith('$')) helpers.set(node.name.text,
              { source: regexSource, flags: literal.slice(lastSlash + 1), node });
          }
        }
        child.forEachChild(inspect);
      }
      node.forEachChild(inspect);
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return helpers;
}

function addHelperRegexBindings(handler, sourceFile, bindings, helpers) {
  function visit(node) {
    if (node !== handler && ts.isFunctionLike(node) && !isImmediatelyInvokedFunction(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && helpers.has(node.initializer.expression.text)
      && node.initializer.arguments.some((argument) => isPathExpression(argument, sourceFile))) {
      bindings.set(node.name.text, { ...helpers.get(node.initializer.expression.text), node });
    }
    node.forEachChild(visit);
  }
  handler.forEachChild(visit);
}

function conditionReferencesIdentifier(condition, bindingName) {
  let found = false;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === bindingName
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      && !(ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node)) found = true;
    if (!found) node.forEachChild(visit);
  }
  visit(condition);
  return found;
}

function directStatementInBlock(node, block) {
  let current = node;
  while (current?.parent && current.parent !== block) current = current.parent;
  return current?.parent === block ? current : undefined;
}

function bindingGuardDominates(binding, candidate, bindingName, sourceFile) {
  let declarationStatement = binding.node;
  while (declarationStatement.parent && !ts.isBlock(declarationStatement.parent)) declarationStatement = declarationStatement.parent;
  const block = declarationStatement.parent;
  if (!ts.isBlock(block)) return false;
  const candidateStatement = directStatementInBlock(candidate, block);
  if (!candidateStatement) return false;
  const declarationIndex = block.statements.indexOf(declarationStatement);
  const candidateIndex = block.statements.indexOf(candidateStatement);
  if (declarationIndex < 0 || candidateIndex <= declarationIndex) return false;
  return block.statements.slice(declarationIndex + 1, candidateIndex).some((statement) => {
    if (!ts.isIfStatement(statement) || !terminalStatement(statement.thenStatement)) return false;
    const compact = statement.expression.getText(sourceFile).replaceAll(/\s/gu, '').replace(/^\((.*)\)$/u, '$1');
    return compact === `!${bindingName}`;
  });
}

function singular(value) {
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.endsWith('ses')) return value.slice(0, -2);
  if (value.endsWith('s')) return value.slice(0, -1);
  return value || 'value';
}

function parameterName(prefix, index, explicit) {
  if (explicit) return explicit;
  const segments = prefix.split('/').filter(Boolean);
  const preceding = [...segments].reverse().find((segment) => /^[a-z][a-z0-9-]*$/iu.test(segment));
  if (!preceding) return `param${index}`;
  if (preceding === 'plan-jobs') return 'jobId';
  if (preceding === 'evidence' || preceding === 'results') return 'digest';
  const camel = singular(preceding).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
  return `${camel}${/(?:id|digest|sha)$/iu.test(camel) ? '' : 'Id'}`;
}

function parseRegexRoute(regexSource) {
  if (!regexSource.startsWith('^') || !regexSource.endsWith('$')) return [];
  const body = regexSource.slice(1, -1);
  const tokens = [];
  let literal = '';
  let captureIndex = 0;
  const flush = () => { if (literal) { tokens.push({ type: 'literal', value: literal }); literal = ''; } };
  for (let index = 0; index < body.length;) {
    if (body[index] === '\\') {
      if (index + 1 >= body.length) return [];
      const escaped = body[index + 1];
      if ('/.-_:'.includes(escaped)) literal += escaped;
      else literal += `\\${escaped}`;
      index += 2;
      continue;
    }
    if (body[index] !== '(') { literal += body[index++]; continue; }
    flush();
    let depth = 1;
    let cursor = index + 1;
    let characterClass = false;
    for (; cursor < body.length && depth; cursor++) {
      const character = body[cursor];
      if (character === '\\') { cursor++; continue; }
      if (character === '[') characterClass = true;
      else if (character === ']') characterClass = false;
      else if (!characterClass && character === '(') depth++;
      else if (!characterClass && character === ')') depth--;
    }
    if (depth) return [];
    let inner = body.slice(index + 1, cursor - 1);
    let capture = true;
    let name;
    if (inner.startsWith('?:')) { capture = false; inner = inner.slice(2); }
    else if (inner.startsWith('?<')) {
      const close = inner.indexOf('>');
      if (close < 0) return [];
      name = inner.slice(2, close); inner = inner.slice(close + 1);
    }
    const optional = body[cursor] === '?';
    if (optional) cursor++;
    const decodedLiteral = inner.replaceAll('\\/', '/').replaceAll('\\.', '.');
    if ((!capture || optional) && /^\/?[A-Za-z0-9._:-]+$/u.test(decodedLiteral)) {
      tokens.push({ type: 'literal', value: decodedLiteral, optional, captureIndex: capture ? ++captureIndex : undefined });
    } else if (capture) {
      captureIndex++;
      tokens.push({ type: 'parameter', constraint: inner, explicitName: name, optional, captureIndex });
    } else return [];
    index = cursor;
  }
  flush();
  for (let index = 0; index + 1 < tokens.length; index++) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (first.type !== 'parameter' || second.type !== 'parameter' || first.optional || second.optional) continue;
    const alternatives = first.constraint.split('|');
    if (alternatives.length < 2 || !alternatives.every((value) => /^sha256(?:%3A|:)$/iu.test(value))) continue;
    tokens.splice(index, 2, { type: 'parameter', constraint: `(?:${first.constraint})${second.constraint}`,
      explicitName: 'digest', optional: false, captureIndices: [first.captureIndex, second.captureIndex] });
  }
  let variants = [{ path: '', parameters: [], captures: new Map() }];
  for (const token of tokens) {
    if (token.type === 'literal') {
      const included = variants.map((variant) => ({ ...variant, path: variant.path + token.value,
        captures: new Map(variant.captures).set(token.captureIndex, true) }));
      variants = token.optional ? [...variants.map((variant) => ({ ...variant, captures: new Map(variant.captures).set(token.captureIndex, false) })), ...included] : included;
      continue;
    }
    const make = (variant) => {
      const captureIndices = token.captureIndices ?? [token.captureIndex];
      const name = parameterName(variant.path, captureIndices[0], token.explicitName);
      return { ...variant, path: `${variant.path}{${name}:${token.constraint}}`,
        parameters: [...variant.parameters, { name, constraint: token.constraint, optional: token.optional }],
        captures: new Map([...variant.captures, ...captureIndices.map((captureIndex) => [captureIndex, true])]) };
    };
    const included = variants.map(make);
    variants = token.optional ? [...variants.map((variant) => ({ ...variant, captures: new Map(variant.captures).set(token.captureIndex, false) })), ...included] : included;
  }
  return variants.map((variant) => ({ ...variant, staticPrefix: variant.path.split('{')[0] }));
}

function captureRequirement(condition, bindingName, captureIndex, sourceFile) {
  const compact = condition.getText(sourceFile).replaceAll(/\s/gu, '');
  const access = `${bindingName}[${captureIndex}]`;
  if (compact.includes(`!${access}`)) return false;
  if (compact.includes(access)) return true;
  return undefined;
}

function routeActivation(pathValue, staticPrefix, guards) {
  for (const guard of guards) {
    const candidate = staticPrefix ?? pathValue;
    if (!(candidate.startsWith(guard.prefix) || guard.prefix.startsWith(candidate))) {
      return { activationState: 'unreachable', activationCondition: `guard ${guard.text}`, reason: `The handler guard requires prefix ${JSON.stringify(guard.prefix)}, but the route matcher requires ${JSON.stringify(candidate)}.` };
    }
  }
  return { activationState: 'active', activationCondition: guards.length ? guards.map((guard) => `pathname starts with ${JSON.stringify(guard.prefix)}`).join(' and ') : 'handler matcher and HTTP method match' };
}

function distinctRoutes(routes) {
  const unique = new Map();
  for (const route of routes) {
    const key = [route.source, route.consumer, route.method, route.path].join('\0');
    const current = unique.get(key);
    if (!current || current.activationState !== 'unreachable') unique.set(key, route);
  }
  return [...unique.values()].sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Discover method-specific routes from JavaScript or TypeScript server handlers. */
export function discoverServerRoutes(inputs, options = {}) {
  const routes = [];
  for (const input of sourceInputs(inputs, options)) {
    const kind = input.source.endsWith('.ts') || input.source.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sourceFile = ts.createSourceFile(input.source, input.text, ts.ScriptTarget.Latest, true, kind);
    const helpers = helperRouteParsers(sourceFile);
    const staticHelpers = staticResponseHelpers(sourceFile);
    function visit(node) {
      if (isHandler(node, sourceFile)) {
        const consumer = functionName(node, sourceFile);
        const guards = startsWithGuards(node, sourceFile);
        const methodGuards = rejectedMethodGuards(node, sourceFile);
        const bindings = regexBindings(node, sourceFile);
        addHelperRegexBindings(node, sourceFile, bindings, helpers);
        function inspect(child, inherited = []) {
          if (child !== node && ts.isFunctionLike(child)) {
            if (!isImmediatelyInvokedFunction(child)) return;
          }
          if (ts.isIfStatement(child)) {
            const conditions = [...inherited, child.expression];
            const methods = [...new Set(conditions.flatMap((condition) => conditionMethods(condition, sourceFile)))];
            const boundary = positivePrefixBoundary(child, sourceFile);
            if (boundary) routes.push({ consumer, method: methods.length ? methods[0] : 'ANY', path: `${boundary.prefix}*`,
              pathKind: 'prefix', parameters: [], source: input.source, origin: input.origin, line: lineAt(sourceFile, boundary.node),
              activationState: 'active', activationCondition: `pathname starts with ${JSON.stringify(boundary.prefix)} and the handler forwards the request` });
            const fallback = staticFallbackBoundary(child, node, sourceFile, staticHelpers);
            if (fallback) routes.push({ consumer, method: 'ANY', path: '/*', pathKind: 'fallback', parameters: [],
              classification: 'server-static-fallback', routeRole: 'static-spa-fallback',
              excludedPaths: fallback.excludedPaths, excludedPrefixes: fallback.excludedPrefixes,
              exclusions: [...fallback.excludedPaths.map((routePath) => ({ kind: 'exact', path: routePath })),
                ...fallback.excludedPrefixes.map((prefix) => ({ kind: 'prefix', path: `${prefix}*` }))],
              source: input.source, origin: input.origin, line: lineAt(sourceFile, child), activationState: 'active',
              activationCondition: `static response fallback when ${[
                ...fallback.excludedPaths.map((routePath) => `pathname is not ${JSON.stringify(routePath)}`),
                ...fallback.excludedPrefixes.map((prefix) => `pathname does not start with ${JSON.stringify(prefix)}`),
              ].join(' and ')}` });
            for (const condition of conditions) for (const exact of [...exactPaths(condition, sourceFile), ...includedPaths(condition, sourceFile)]) {
              const guardedMethods = methodGuards.filter((guard) => guard.line < lineAt(sourceFile, exact.node)).map((guard) => guard.method);
              for (const method of methods.length ? methods : guardedMethods.length ? [...new Set(guardedMethods)] : ['ANY']) routes.push({ consumer, method, path: exact.path, pathKind: 'static', parameters: [],
                source: input.source, origin: input.origin, line: lineAt(sourceFile, exact.node),
                ...routeActivation(exact.path, exact.path, guards) });
            }
            for (const [name, binding] of bindings) {
              const conditionUsesBinding = conditions.some((condition) => conditionReferencesIdentifier(condition, name));
              if (!conditionUsesBinding && !bindingGuardDominates(binding, child, name, sourceFile)) continue;
              for (const variant of parseRegexRoute(binding.source)) {
                let compatible = true;
                for (const [captureIndex, present] of variant.captures) {
                  if (!captureIndex) continue;
                  const required = conditions.map((condition) => captureRequirement(condition, name, captureIndex, sourceFile)).find((value) => value !== undefined);
                  if (required !== undefined && required !== present) compatible = false;
                }
                if (!compatible) continue;
                for (const method of methods) routes.push({ consumer, method, path: variant.path, pathKind: 'anchored-regex',
                  regex: binding.source, parameters: variant.parameters, source: input.source, origin: input.origin,
                  line: lineAt(sourceFile, binding.node), ...routeActivation(variant.path, variant.staticPrefix, guards) });
              }
            }
            if (terminalStatement(child.thenStatement)) {
              const rejectedPaths = exactPaths(child.expression, sourceFile, true);
              const acceptedMethods = conditionMethods(child.expression, sourceFile, true);
              for (const exact of rejectedPaths) for (const method of acceptedMethods.length ? acceptedMethods : ['ANY']) routes.push({ consumer, method, path: exact.path,
                pathKind: 'static', parameters: [], source: input.source, origin: input.origin, line: lineAt(sourceFile, child),
                ...routeActivation(exact.path, exact.path, guards) });
            }
            inspect(child.thenStatement, conditions);
            if (child.elseStatement) inspect(child.elseStatement, inherited);
            return;
          }
          child.forEachChild((grandchild) => inspect(grandchild, inherited));
        }
        inspect(node);
        return;
      }
      node.forEachChild(visit);
    }
    visit(sourceFile);
  }
  return distinctRoutes(routes);
}

export const discoverMethodAwareServerRoutes = discoverServerRoutes;

const GO_HTTP_METHODS = new Map([
  ['Get', 'GET'], ['Post', 'POST'], ['Put', 'PUT'], ['Patch', 'PATCH'], ['Delete', 'DELETE'],
  ['Head', 'HEAD'], ['Options', 'OPTIONS'],
]);

function goFunctionAt(source, index) {
  const prefix = source.slice(0, index);
  return [...prefix.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)\s*\(/gmu)].at(-1)?.[1] ?? '<go function>';
}

/** Discover literal net/http routes from shipped Go controllers. */
export function discoverGoServerRoutes(inputs, options = {}) {
  const records = [];
  for (const input of sourceInputs(inputs, options)) {
    for (const match of input.text.matchAll(/r\.URL\.Path\s*!=\s*"(\/[^"\n]+)"/gu)) {
      const context = input.text.slice(Math.max(0, match.index - 500), match.index);
      const methodName = [...context.matchAll(/r\.Method\s*!=\s*http\.Method([A-Za-z]+)/gu)].at(-1)?.[1];
      const method = GO_HTTP_METHODS.get(methodName);
      if (!method) continue;
      const consumer = goFunctionAt(input.text, match.index);
      const activation = options.activationFor?.({ input, consumer, method, path: match[1] }) ?? {};
      records.push({ consumer: goFunctionAt(input.text, match.index), method, path: match[1], pathKind: 'static',
        parameters: [], source: input.source, origin: input.origin, line: input.text.slice(0, match.index).split('\n').length,
        activationState: activation.activationState ?? options.activationState ?? 'active',
        activationCondition: activation.activationCondition ?? options.activationCondition
          ?? 'the Go handler admits this exact method and path' });
    }
  }
  return distinctRoutes(records);
}

function goPath(expression) {
  const compact = expression.trim();
  if (/^c\.leasePath\(\s*""\s*\)$/u.test(compact)) return '/apis/{leaseApiGroup}/{leaseApiVersion}/namespaces/{controllerNamespace}/busternamespaceleases';
  if (/^c\.leasePath\(/u.test(compact)) return '/apis/{leaseApiGroup}/{leaseApiVersion}/namespaces/{controllerNamespace}/busternamespaceleases/{leaseName}';
  if (/^c\.statusPath\(/u.test(compact)) return '/apis/{leaseApiGroup}/{leaseApiVersion}/namespaces/{controllerNamespace}/busternamespaceleases/{leaseName}/status';
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(compact)) return `{${compact}}`;
  const pieces = compact.split(/\s*\+\s*/u).map((piece) => {
    if (/^"(?:[^"\\]|\\.)*"$/u.test(piece)) {
      try { return JSON.parse(piece); } catch { return undefined; }
    }
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(piece)) return `{${piece}}`;
    return undefined;
  });
  if (pieces.every((piece) => piece !== undefined)) return pieces.join('');
  return `{${compact.replaceAll(/\s+/gu, ' ')}}`;
}

/** Discover Kubernetes API calls made by the shipped Go namespace controller. */
export function discoverGoKubernetesConnections(inputs, options = {}) {
  const records = [];
  for (const input of sourceInputs(inputs, options)) {
    for (const match of input.text.matchAll(/c\.kube\(\s*ctx,\s*http\.Method([A-Za-z]+),\s*([^,\n]+)/gu)) {
      const method = GO_HTTP_METHODS.get(match[1]);
      if (!method) continue;
      const target = goPath(match[2]);
      const caller = goFunctionAt(input.text, match.index);
      const activation = options.activationFor?.({ input, caller, method, target }) ?? {};
      records.push({ caller, consumer: caller, method, target, path: target, base: '{in-cluster Kubernetes API}',
        classification: 'kubernetes-api', providerFamily: 'buster-namespace-controller',
        providerClassification: 'kubernetes-api', source: input.source, origin: input.origin,
        line: input.text.slice(0, match.index).split('\n').length,
        activationState: activation.activationState ?? 'active',
        activationCondition: activation.activationCondition ?? 'the deployed namespace controller executes this Kubernetes API client path' });
    }
  }
  const unique = new Map();
  for (const record of records) {
    const key = [record.source, record.line, record.method, record.target].join('\0');
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) => left.source.localeCompare(right.source) || left.line - right.line);
}

function outboundFunctionName(node, sourceFile) {
  if (node.name) return node.name.getText(sourceFile);
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) return node.parent.name.getText(sourceFile);
  return undefined;
}

function outboundCalleeName(node, sourceFile) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.getText(sourceFile);
  return node.getText(sourceFile);
}

function outboundPlaceholder(node, sourceFile) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.getText(sourceFile).replace(/^this\.#?/u, '');
  return node.getText(sourceFile).replaceAll(/\s+/gu, ' ');
}

function outboundDefinitions(contexts) {
  const definitions = new Map();
  const declarations = new Map();
  const add = (map, name, value) => map.set(name, [...(map.get(name) ?? []), value]);
  for (const context of contexts) {
    function visit(node, scope) {
      const childScope = ts.isFunctionLike(node) ? node : scope;
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        const name = outboundFunctionName(node, context.sourceFile);
        if (name) add(definitions, name, { node, method: ts.isMethodDeclaration(node), ...context });
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        add(declarations, node.name.text, { node: node.initializer, position: node.getStart(context.sourceFile), scope, ...context });
      }
      node.forEachChild((child) => visit(child, childScope));
    }
    visit(context.sourceFile, undefined);
  }
  return { definitions, declarations };
}

function directHttpCallee(name) {
  return name === 'fetch' || ['request', 'http.request', 'https.request'].includes(name);
}

function fetchExpression(node, sourceFile) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (node.getText(sourceFile) === 'fetch') return true;
  if (ts.isPropertyAccessExpression(node)) return node.name.text === 'fetch';
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && fetchExpression(node.left, sourceFile) && fetchExpression(node.right, sourceFile);
}

function helperCandidates(expression, sourceFile, definitions) {
  const name = outboundCalleeName(expression, sourceFile);
  if (ts.isIdentifier(expression)) {
    const candidates = (definitions.get(name) ?? []).filter((item) => !item.method);
    const local = candidates.filter((item) => item.sourceFile === sourceFile);
    return local.length ? local : candidates.length === 1 ? candidates : [];
  }
  if (ts.isPropertyAccessExpression(expression) && expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return (definitions.get(name) ?? []).filter((item) => item.method && item.sourceFile === sourceFile);
  }
  return [];
}

function networkReachableFunctions(definitions) {
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, candidates] of definitions) {
      if (reachable.has(name)) continue;
      if (candidates.some((candidate) => {
        let found = false;
        function visit(node) {
          if (node !== candidate.node && ts.isFunctionLike(node)) return;
          if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(candidate.sourceFile);
            const short = outboundCalleeName(node.expression, candidate.sourceFile);
            if (directHttpCallee(callee) || fetchExpression(node.expression, candidate.sourceFile)
              || (reachable.has(short) && helperCandidates(node.expression, candidate.sourceFile, definitions).length)) found = true;
          }
          if (!found) node.forEachChild(visit);
        }
        candidate.node.forEachChild(visit);
        return found;
      })) { reachable.add(name); changed = true; }
    }
  }
  return reachable;
}

function outboundEvaluator(metadata) {
  const { definitions, declarations } = metadata;
  function lexicalFunction(node) {
    let current = node.parent;
    while (current && !ts.isFunctionLike(current)) current = current.parent;
    return current;
  }
  function declaration(name, sourceFile, position, useNode) {
    const scope = lexicalFunction(useNode);
    const candidates = (declarations.get(name) ?? []).filter((item) => item.sourceFile === sourceFile && item.position < position);
    return candidates.filter((item) => item.scope === scope).at(-1) ?? candidates.filter((item) => item.scope === undefined).at(-1);
  }
  function value(node, sourceFile, environment = new Map(), seen = new Set()) {
    if (!node) return { kind: 'undefined' };
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression;
    const literal = stringValue(node);
    if (literal !== undefined) return { kind: 'string', text: literal, dynamic: false };
    if (node.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(node) && node.text === 'undefined')) return { kind: 'undefined' };
    if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'boolean', value: true };
    if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'boolean', value: false };
    if (ts.isIdentifier(node)) {
      if (environment.has(node.text)) return environment.get(node.text);
      const key = `${sourceFile.fileName}:${node.text}:${node.getStart(sourceFile)}`;
      if (seen.has(key)) return { kind: 'dynamic', text: `{${node.text}}` };
      const binding = declaration(node.text, sourceFile, node.getStart(sourceFile), node);
      if (binding) {
        const resolved = value(binding.node, binding.sourceFile, environment, new Set(seen).add(key));
        if (resolved.kind === 'string' && resolved.dynamic && !resolved.text.includes('/')) return { kind: 'dynamic', text: `{${node.text}}` };
        return resolved;
      }
      return { kind: 'dynamic', text: `{${node.text}}` };
    }
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map();
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) properties.set(property.name.getText(sourceFile).replaceAll(/['"]/gu, ''), value(property.initializer, sourceFile, environment, seen));
        else if (ts.isShorthandPropertyAssignment(property)) properties.set(property.name.text, value(property.name, sourceFile, environment, seen));
      }
      return { kind: 'object', properties };
    }
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text; let dynamic = false;
      for (const span of node.templateSpans) {
        const part = value(span.expression, sourceFile, environment, seen);
        if (part.kind === 'string') { text += part.text; dynamic ||= part.dynamic; }
        else { text += part.text ?? `{${outboundPlaceholder(span.expression, sourceFile)}}`; dynamic = true; }
        text += span.literal.text;
      }
      return { kind: 'string', text, dynamic };
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = value(node.left, sourceFile, environment, seen); const right = value(node.right, sourceFile, environment, seen);
      if (left.kind === 'string' && right.kind === 'string') return { kind: 'string', text: left.text + right.text, dynamic: left.dynamic || right.dynamic };
    }
    if (ts.isConditionalExpression(node)) {
      const condition = booleanValue(node.condition, sourceFile, environment, seen);
      if (condition !== undefined) return value(condition ? node.whenTrue : node.whenFalse, sourceFile, environment, seen);
      const whenTrue = value(node.whenTrue, sourceFile, environment, seen); const whenFalse = value(node.whenFalse, sourceFile, environment, seen);
      if (whenTrue.kind === whenFalse.kind && whenTrue.text === whenFalse.text && whenTrue.value === whenFalse.value) return whenTrue;
      return { kind: 'dynamic', text: `{${outboundPlaceholder(node, sourceFile)}}` };
    }
    if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === 'URL') {
      return { kind: 'url', target: value(node.arguments?.[0], sourceFile, environment, seen),
        base: value(node.arguments?.[1], sourceFile, environment, seen) };
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'encodeURIComponent') {
        const inner = value(node.arguments[0], sourceFile, environment, seen);
        return inner.kind === 'string' && !inner.dynamic ? { kind: 'string', text: encodeURIComponent(inner.text), dynamic: false }
          : { kind: 'string', text: inner.text ?? `{${outboundPlaceholder(node.arguments[0], sourceFile)}}`, dynamic: true };
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'toString') return value(node.expression.expression, sourceFile, environment, seen);
      const returned = helperReturn(node, sourceFile, environment, seen);
      if (returned) return returned;
    }
    return { kind: 'dynamic', text: `{${outboundPlaceholder(node, sourceFile)}}` };
  }
  function booleanValue(node, sourceFile, environment, seen) {
    if (!ts.isBinaryExpression(node)) return undefined;
    if (![ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)) return undefined;
    const left = value(node.left, sourceFile, environment, seen); const right = value(node.right, sourceFile, environment, seen);
    if (left.kind === 'dynamic' || right.kind === 'dynamic') return undefined;
    const primitive = (item) => item.kind === 'undefined' ? 'undefined:'
      : item.kind === 'string' ? `string:${item.text}` : item.kind === 'boolean' ? `boolean:${item.value}` : `${item.kind}:object`;
    const equal = primitive(left) === primitive(right);
    return [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(node.operatorToken.kind) ? equal : !equal;
  }
  function constrainedReturn(definition, environment, seen) {
    let candidate;
    function inspect(node) {
      if (node !== definition.node && ts.isFunctionLike(node)) return;
      if (ts.isBinaryExpression(node)) {
        const left = node.left.getText(definition.sourceFile); const right = node.right.getText(definition.sourceFile);
        const pathNode = /\.pathname$/u.test(left) ? node.right : /\.pathname$/u.test(right) ? node.left : undefined;
        if (pathNode) {
          const resolved = value(pathNode, definition.sourceFile, environment, seen);
          if (resolved.kind === 'string' && resolved.text.startsWith('/')) candidate = { kind: 'url', target: resolved, base: { kind: 'dynamic', text: '{validated origin}' } };
        }
      }
      if (!candidate) node.forEachChild(inspect);
    }
    definition.node.forEachChild(inspect);
    return candidate;
  }
  function helperReturn(call, sourceFile, environment, seen) {
    for (const definition of helperCandidates(call.expression, sourceFile, definitions)) {
      const key = `return:${definition.sourceFile.fileName}:${definition.node.pos}`;
      if (seen.has(key)) continue;
      const inner = new Map();
      definition.node.parameters.forEach((parameter, index) => {
        if (ts.isIdentifier(parameter.name)) inner.set(parameter.name.text, value(call.arguments[index], sourceFile, environment, seen));
      });
      let returnNode;
      if (ts.isArrowFunction(definition.node) && !ts.isBlock(definition.node.body)) returnNode = definition.node.body;
      else {
        function find(node) {
          if (node !== definition.node && ts.isFunctionLike(node)) return;
          if (!returnNode && ts.isReturnStatement(node) && node.expression) returnNode = node.expression;
          if (!returnNode) node.forEachChild(find);
        }
        definition.node.body?.forEachChild(find);
      }
      if (returnNode) {
        const result = value(returnNode, definition.sourceFile, inner, new Set(seen).add(key));
        if (!(result.kind === 'dynamic' || (result.kind === 'url' && result.target?.kind === 'dynamic'))) return result;
      }
      const constrained = constrainedReturn(definition, inner, new Set(seen).add(key));
      if (constrained) return constrained;
    }
    return undefined;
  }
  return { value };
}

function outboundTarget(resolved) {
  const targetValue = resolved?.kind === 'url' ? resolved.target : resolved;
  if (targetValue?.kind !== 'string') return undefined;
  let target = targetValue.text;
  let base = resolved?.kind === 'url' ? resolved.base?.text : undefined;
  if (!target.startsWith('/') && !/^https?:\/\//u.test(target)) {
    const pathIndex = target.search(/\/(?:v[0-9]+|api)\//u);
    if (pathIndex < 0) return undefined;
    base ??= target.slice(0, pathIndex);
    target = target.slice(pathIndex);
  }
  return { target, base };
}

function outboundMethod(options) {
  if (!options) return 'GET';
  if (options.kind !== 'object') return 'DYNAMIC';
  const method = options.properties.get('method');
  if (!method) return 'GET';
  if (method.kind !== 'string' || method.dynamic) return 'DYNAMIC';
  const normalized = method.text.toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : 'DYNAMIC';
}

function objectProperty(object, name, sourceFile) {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  for (const property of object.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = stringValue(property.name) ?? property.name.getText(sourceFile);
    if (propertyName === name) return property.initializer;
  }
  return undefined;
}

function dynamicProviderOutbound(input, node, sourceFile) {
  const source = input.source.replaceAll('\\', '/');
  const sourceIs = (relative) => source === relative || source.endsWith(`/${relative}`);
  const callee = node.expression.getText(sourceFile);
  const options = node.arguments[1];
  const method = objectProperty(options, 'method', sourceFile);
  if (sourceIs('skills/buster/engine/test-gates/network-http-runtime.ts')
    && fetchExpression(node.expression, sourceFile) && node.arguments[0]?.getText(sourceFile) === 'url'
    && method?.getText(sourceFile) === 'method') {
    return { method: 'DYNAMIC', target: '{configuredUrl}', path: '{configuredUrl}', dynamic: true,
      targetKind: 'configured-url', providerFamily: 'buster-network-http', providerClassification: 'network.http',
      classification: 'dynamic-provider-http',
      activationCondition: 'an admitted Buster network.http request passes configured URL, method, origin, port, header, and size policy' };
  }
  if (sourceIs('skills/common/plugins/network-http/src/adapter.ts')
    && fetchExpression(node.expression, sourceFile) && node.arguments[0]?.getText(sourceFile) === 'url'
    && method?.getText(sourceFile) === 'method') {
    return { method: 'DYNAMIC', target: '{configuredUrl}', path: '{configuredUrl}', dynamic: true,
      targetKind: 'configured-url', providerFamily: 'common-network-http-adapter', providerClassification: 'network.http',
      classification: 'dynamic-provider-http',
      activationCondition: 'an activated common network.http adapter request passes configured capability, URL, method, origin, header, fence, and size policy' };
  }
  const requestPath = objectProperty(options, 'path', sourceFile);
  if (sourceIs('tools/ops-mcp/src/kubernetes.mjs') && callee === 'request'
    && node.arguments[0]?.getText(sourceFile) === 'origin' && stringValue(method)?.toUpperCase() === 'GET'
    && requestPath?.getText(sourceFile) === 'path') {
    return { caller: 'kubeRequest', method: 'GET', target: '{kubernetesApiPath}', path: '{kubernetesApiPath}', base: '{configuredKubernetesApiOrigin}',
      dynamic: true, targetKind: 'dynamic-api-path', providerFamily: 'ops-mcp-kubernetes-client',
      providerClassification: 'kubernetes-api', classification: 'dynamic-provider-http',
      activationCondition: 'an authenticated Ops MCP read selects a validated Kubernetes API path and uses the configured HTTPS origin, projected token, and CA' };
  }
  return undefined;
}

/** Discover concrete and stable symbolic outbound HTTP call sites without adding them to the server-route inventory. */
export function discoverOutboundConnections(inputs, options = {}) {
  const records = [];
  const contexts = sourceInputs(inputs, options).map((input) => {
    const kind = input.source.endsWith('.ts') || input.source.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sourceFile = ts.createSourceFile(input.source, input.text, ts.ScriptTarget.Latest, true, kind);
    return { input, sourceFile };
  });
  const metadata = outboundDefinitions(contexts);
  const reachable = networkReachableFunctions(metadata.definitions);
  const evaluate = outboundEvaluator(metadata).value;
  for (const context of contexts) {
    const { input, sourceFile } = context;
    const functionStack = [];
    function add(node, evidenceContext, caller, method, target, callee, base, condition, details = {}) {
      const evidenceSourceFile = evidenceContext?.sourceFile ?? sourceFile;
      const evidenceInput = evidenceContext?.input ?? input;
      records.push({ caller, consumer: caller, method, target,
        path: details.path ?? (target.startsWith('/') ? target : undefined), callee, base: details.base ?? base,
        classification: details.classification ?? 'outbound-http', source: evidenceInput.source, origin: evidenceInput.origin,
        line: lineAt(evidenceSourceFile, node), activationState: 'active', activationCondition: condition,
        ...(details.dynamic ? { dynamic: true } : {}), ...(details.targetKind ? { targetKind: details.targetKind } : {}),
        ...(details.providerFamily ? { providerFamily: details.providerFamily } : {}),
        ...(details.providerClassification ? { providerClassification: details.providerClassification } : {}) });
    }
    function processCall(node, activeSourceFile, environment, root, chain = new Set()) {
      const callee = node.expression.getText(activeSourceFile);
      const short = outboundCalleeName(node.expression, activeSourceFile);
      if (callee === 'productController') {
        const found = outboundTarget(evaluate(node.arguments[1], activeSourceFile, environment));
        if (found) add(root.node, root.context, root.caller, 'POST', found.target, callee,
          evaluate(node.arguments[0], activeSourceFile, environment)?.text, 'the source calls productController with this static path');
        return;
      }
      if (directHttpCallee(callee) || fetchExpression(node.expression, activeSourceFile)) {
        const found = outboundTarget(evaluate(node.arguments[0], activeSourceFile, environment));
        if (!found) {
          const symbolic = chain.size === 0 && root.node === node
            ? dynamicProviderOutbound(root.context.input, node, activeSourceFile) : undefined;
          if (symbolic) add(node, root.context, symbolic.caller ?? root.caller, symbolic.method, symbolic.target, callee, symbolic.base,
            symbolic.activationCondition, symbolic);
          return;
        }
        const method = outboundMethod(evaluate(node.arguments[1], activeSourceFile, environment));
        add(root.node, root.context, root.caller, method, found.target, callee, found.base,
          'the source reaches an HTTP call with this statically resolved target and method');
        return;
      }
      if (!reachable.has(short)) return;
      if (node.arguments.length === 0) return;
      for (const definition of helperCandidates(node.expression, activeSourceFile, metadata.definitions)) {
        const key = `${definition.sourceFile.fileName}:${definition.node.pos}`;
        if (chain.has(key)) continue;
        const inner = new Map();
        definition.node.parameters.forEach((parameter, index) => {
          if (ts.isIdentifier(parameter.name)) inner.set(parameter.name.text, evaluate(node.arguments[index], activeSourceFile, environment));
        });
        function inspect(child) {
          if (child !== definition.node && ts.isFunctionLike(child)) return;
          if (ts.isCallExpression(child)) processCall(child, definition.sourceFile, inner, root, new Set(chain).add(key));
          child.forEachChild(inspect);
        }
        definition.node.body?.forEachChild(inspect);
      }
    }
    function visit(node) {
      const entersFunction = ts.isFunctionLike(node);
      if (entersFunction) functionStack.push(functionName(node, sourceFile));
      if (ts.isCallExpression(node)) {
        const caller = functionStack.at(-1) ?? '<module>';
        processCall(node, sourceFile, new Map(), { node, context, caller });
      }
      node.forEachChild(visit);
      if (entersFunction) functionStack.pop();
    }
    visit(sourceFile);
  }
  for (const { input, sourceFile } of contexts) {
    const normalizedSource = input.source.replaceAll('\\', '/');
    if (!normalizedSource.endsWith('/skills/nova/plugins/demo-handoff/src/controller-client.ts')
      && normalizedSource !== 'skills/nova/plugins/demo-handoff/src/controller-client.ts') continue;
    const requestIndex = input.text.indexOf('https.request');
    if (requestIndex < 0 || !input.text.includes("if(status)url.pathname+='/status'")) continue;
    for (const target of ['/v1/demo-ready', '/v1/demo-ready/status']) records.push({
      caller: 'post', consumer: 'post', method: 'POST', target, path: target, callee: 'https.request',
      base: '{configured demo-ready controller HTTPS origin}', classification: 'outbound-https',
      source: input.source, origin: input.origin, line: input.text.slice(0, requestIndex).split('\n').length,
      activationState: 'conditional',
      activationCondition: 'the kubeclaw.demo-handoff adapter is activated with a validated /v1/demo-ready endpoint; the selected Nova profile does not enable readyClient by default',
    });
  }
  const unique = new Map();
  for (const record of records) {
    const key = [record.source, record.line, record.caller, record.method, record.target].join('\0');
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()].sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.target.localeCompare(b.target));
}

function objectInput(entry, index) {
  if (entry?.value && entry.value.kind) return { object: entry.value, origin: entry.origin ?? entry.profile ?? entry.source ?? '<rendered>', profile: entry.profile ?? entry.origin, source: entry.source, line: entry.line, fixtureOverrides: entry.fixtureOverrides, renderActivationState: entry.activationState, renderActivationCondition: entry.activationCondition };
  if (entry?.object?.kind) return { object: entry.object, origin: entry.origin ?? entry.profile ?? entry.source ?? '<rendered>', profile: entry.profile ?? entry.origin, source: entry.source, line: entry.line, fixtureOverrides: entry.fixtureOverrides, renderActivationState: entry.activationState, renderActivationCondition: entry.activationCondition };
  return { object: entry, origin: entry?.origin ?? '<rendered>', profile: entry?.profile, source: entry?.source, line: entry?.line, index };
}

function podSpec(object) {
  if (object.kind === 'Pod') return object.spec;
  if (object.kind === 'CronJob') return object.spec?.jobTemplate?.spec?.template?.spec;
  return object.spec?.template?.spec;
}

function registryHost(image) {
  const first = image.split('/')[0];
  return first.includes('.') || first.includes(':') || first === 'localhost' ? first : 'docker.io';
}

function identitiesFromSignal(name, value) {
  const key = String(name ?? '').toLowerCase();
  const field = String(value ?? '').toLowerCase();
  const text = `${key} ${field}`;
  const disabledFeature = /(?:^|[._-])(?:enabled|mode)(?:$|[._-])/u.test(key)
    && /^(?:false|off|disabled|none|0)$/u.test(field.trim());
  const identities = [];
  const add = (identity) => { if (!identities.includes(identity)) identities.push(identity); };
  if (/openai/u.test(key) || /(?:^|[^a-z0-9])openai(?:\/|:)/u.test(field) || /^(?:openai|openai-compatible)$/u.test(field)) add('openai');
  if (/vertex(?:_ai)?|google_application_credentials/u.test(key) || /vertex_ai\//u.test(field)) add('vertex-ai');
  if (/discord/u.test(key) || /^(?:discord|discord:.*)$/u.test(field)) add('discord');
  if (/litellm/u.test(key) || /(?:^|[./-])litellm(?:[./:-]|$)/u.test(field)) add('litellm');
  if (/(?:^|[._-])redis(?:[_-]?(?:host|port|url|password|stream|endpoint|health)|$)/u.test(key)
    || /^(?:redis|rediss):\/\//u.test(field) || /(?:^|\.)redis(?:[.-]|$)/u.test(field)) add('redis');
  if (/postgres(?:ql)?/u.test(key) || /^postgres(?:ql)?:\/\//u.test(field) || /(?:^|[./-])postgres(?:ql)?(?:[./:@-]|$)/u.test(field)) add('postgresql');
  if (!disabledFeature && (/tailscale/u.test(key) || /(?:^|[./-])tailscale(?:[./:-]|$)/u.test(field))) add('tailscale');
  if (/buildkit/u.test(key) || /(?:^|[./-])buildkit(?:d)?(?:[./:-]|$)/u.test(field)) add('buildkit');
  if (/registry-local|kubeclaw_registry|container_build_registry/u.test(text)) add('registry-local');
  if (/registry-mirror/u.test(text) || /registry_proxy_remoteurl/u.test(key)) add('registry-mirror');
  if (/ghcr\.io/u.test(text)) add('ghcr.io');
  if (/docker\.io|registry-1\.docker\.io/u.test(text)) add('docker.io');
  return identities;
}

function semanticIdentities(name, value) {
  if (typeof value !== 'string' || !value || /^(?:secret|configmap):/u.test(value)) return [];
  const key = String(name ?? '').toLowerCase();
  const booleanLike = /^(?:true|false|yes|no|on|off|0|1)$/iu.test(value.trim());
  const identities = [];
  if (/(?:^|[._-])provider(?:$|[._-])/u.test(key)) identities.push(`provider:${value}`);
  if (!booleanLike && !/(?:store|persist|save).*(?:model).*(?:db|database)|(?:db|database).*(?:model)/u.test(key)
    && (/(?:^|[._-])model(?:s|_name)?(?:$|[._-])/u.test(key) || /(?:primary|fallbacks?)(?:$|[._-])/u.test(key))) identities.push(`model:${value}`);
  if (/(?:^|[._-])channel(?:_?id)?(?:$|[._-])/u.test(key)) identities.push(`channel:${value}`);
  if (/(?:host|hostname)$/u.test(key) && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::[0-9]+)?$/iu.test(value)) {
    identities.push(value.replace(/:[0-9]+$/u, ''));
  }
  if (/^(?:unix):\/\//iu.test(value)) identities.push(`unix-socket:${value.slice('unix://'.length)}`);
  return identities;
}

function stringsIn(value, prefix = '', result = []) {
  if (typeof value === 'string') { result.push({ key: prefix, value }); return result; }
  if (Array.isArray(value)) return value.forEach((item, index) => stringsIn(item, `${prefix}[${index}]`, result)), result;
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) stringsIn(child, prefix ? `${prefix}.${key}` : key, result);
  return result;
}

function parsedConfigStrings(value, key) {
  const result = [{ key, value }];
  if (typeof value !== 'string') return result;
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return result;
  try { return stringsIn(JSON.parse(trimmed), key); } catch { return result; }
}

function conciseSignalValue(value, maximum = 180) {
  const original = String(value ?? '');
  const oneLine = original.replaceAll(/\s+/gu, ' ').trim();
  if (oneLine.length <= maximum) return oneLine;
  const digest = createHash('sha256').update(original).digest('hex').slice(0, 12);
  return `${oneLine.slice(0, maximum - 35).trimEnd()}… [${original.length} chars sha256:${digest}]`;
}

function signalText(name, value) {
  return `${name}=${conciseSignalValue(value)}`;
}

function dependencyRecordsForValue(name, value, base, classification, signal, activationState = 'active', activationCondition) {
  const identities = [...new Set([...identitiesFromSignal(name, value), ...semanticIdentities(name, value)])];
  return identities.map((dependencyIdentity) => ({ ...base, dependency: dependencyIdentity, dependencyIdentity, signal,
    classification, activationState, activationCondition: activationCondition ?? `${name} is present in the rendered object` }));
}

function workloadConsumer(object, container) {
  const namespace = object.metadata?.namespace ?? 'default';
  return `${object.kind}/${namespace}/${object.metadata?.name ?? '<unnamed>'}${container ? `#${container}` : ''}`;
}

function addUrlSignals(records, name, value, base) {
  if (typeof value !== 'string') return;
  const urls = value.match(/(?:https?|redis|rediss|postgres(?:ql)?|unix):\/\/[^\s,'"}\]]+/giu) ?? [];
  for (const url of urls) {
    let host = url;
    try { host = new URL(url).hostname || url; } catch { /* Unix sockets are not WHATWG URLs. */ }
    const identities = identitiesFromSignal(name, `${url} ${host}`);
    const fallbacks = identities.length ? identities : [url.startsWith('unix://') ? `unix-socket:${url.slice(7)}` : host];
    for (const dependencyIdentity of fallbacks) records.push({ ...base, dependency: dependencyIdentity, dependencyIdentity,
      signal: signalText(name, url), classification: url.startsWith('unix://') ? 'unix-socket' : 'endpoint', activationState: 'active',
      activationCondition: `${name} contains a rendered endpoint` });
  }
}

/** Discover runtime dependency evidence from already parsed or rendered Kubernetes objects. */
export function discoverRuntimeDependencySignals(renderedObjects, options = {}) {
  const records = [];
  const entries = (Array.isArray(renderedObjects) ? renderedObjects : [renderedObjects]).filter(Boolean).map(objectInput);
  for (const entry of entries) {
    const object = entry.object;
    if (!object?.kind || !object.metadata) continue;
    const base = { consumer: workloadConsumer(object), profile: entry.profile ?? options.profile ?? entry.origin,
      origin: entry.origin, source: entry.source, line: entry.line, fixtureOverrides: entry.fixtureOverrides,
      renderActivationState: entry.renderActivationState, renderActivationCondition: entry.renderActivationCondition };
    const spec = podSpec(object);
    if (WORKLOAD_KINDS.has(object.kind) && spec) {
      for (const container of [...(spec.initContainers ?? []), ...(spec.containers ?? []), ...(spec.ephemeralContainers ?? [])]) {
        const containerBase = { ...base, consumer: workloadConsumer(object, container.name) };
        if (typeof container.image === 'string') {
          records.push({ ...containerBase, dependency: container.image, dependencyIdentity: container.image, signal: `image=${container.image}`,
            classification: 'workload-image', activationState: 'active', activationCondition: `${container.name} is present in the rendered pod specification` });
          const host = registryHost(container.image);
          records.push({ ...containerBase, dependency: host, dependencyIdentity: host, signal: `image registry for ${container.image}`,
            classification: 'image-registry', activationState: 'active', activationCondition: `${container.name} pulls the rendered image` });
        }
        for (const environment of container.env ?? []) {
          const value = environment.value;
          const reference = environment.valueFrom?.secretKeyRef ? `secret:${environment.valueFrom.secretKeyRef.name}#${environment.valueFrom.secretKeyRef.key}`
            : environment.valueFrom?.configMapKeyRef ? `configmap:${environment.valueFrom.configMapKeyRef.name}#${environment.valueFrom.configMapKeyRef.key}` : undefined;
          const rendered = value ?? reference;
          if (rendered === undefined) continue;
          records.push(...dependencyRecordsForValue(environment.name, rendered, containerBase, 'environment-signal',
            signalText(environment.name, reference ?? value), 'active', `${environment.name} is present in the rendered container environment`));
          addUrlSignals(records, environment.name, value, containerBase);
        }
        for (const [probeName, probe] of [['startupProbe', container.startupProbe], ['readinessProbe', container.readinessProbe]]) {
          if (!probe) continue;
          const target = probe.httpGet ? `http:${probe.httpGet.port}${probe.httpGet.path ?? '/'}` : probe.tcpSocket ? `tcp:${probe.tcpSocket.port}`
            : probe.exec ? `exec:${(probe.exec.command ?? []).join(' ')}` : 'configured probe';
          records.push({ ...containerBase, dependency: target, dependencyIdentity: target, signal: probeName, classification: 'hard-readiness-gate',
            activationState: 'active', activationCondition: `Kubernetes requires the rendered ${probeName} to succeed` });
        }
      }
      const serviceAccount = spec.serviceAccountName ?? spec.serviceAccount;
      if (serviceAccount) records.push({ ...base, dependency: `serviceaccount:${serviceAccount}`, dependencyIdentity: `serviceaccount:${serviceAccount}`,
        signal: `serviceAccountName=${serviceAccount}`, classification: 'workload-identity', activationState: 'active',
        activationCondition: 'the rendered pod specification selects this ServiceAccount' });
      if (spec.automountServiceAccountToken !== undefined) records.push({ ...base, dependency: 'kubernetes-api-token', dependencyIdentity: 'kubernetes-api-token',
        signal: `automountServiceAccountToken=${spec.automountServiceAccountToken}`, classification: 'api-token',
        activationState: spec.automountServiceAccountToken ? 'active' : 'inactive',
        activationCondition: `automountServiceAccountToken is explicitly ${spec.automountServiceAccountToken}` });
      for (const volume of spec.volumes ?? []) {
        if (volume.persistentVolumeClaim?.claimName) records.push({ ...base, dependency: `pvc:${volume.persistentVolumeClaim.claimName}`,
          dependencyIdentity: `pvc:${volume.persistentVolumeClaim.claimName}`, signal: `volume:${volume.name}`, classification: 'persistent-volume',
          activationState: 'active', activationCondition: 'the rendered pod mounts this PersistentVolumeClaim' });
        if (volume.csi?.driver) records.push({ ...base, dependency: `csi:${volume.csi.driver}`, dependencyIdentity: `csi:${volume.csi.driver}`,
          signal: `volume:${volume.name}`, classification: 'csi-driver', activationState: 'active', activationCondition: 'the rendered pod declares this CSI volume' });
        if (volume.hostPath?.path) records.push({ ...base, dependency: `hostPath:${volume.hostPath.path}`, dependencyIdentity: `hostPath:${volume.hostPath.path}`,
          signal: `volume:${volume.name}`, classification: 'host-path', activationState: 'active', activationCondition: 'the rendered pod declares this hostPath volume' });
        for (const projected of volume.projected?.sources ?? []) if (projected.serviceAccountToken) records.push({ ...base,
          dependency: 'kubernetes-api-token', dependencyIdentity: 'kubernetes-api-token', signal: `projected serviceAccountToken:${volume.name}`,
          classification: 'api-token', activationState: 'active', activationCondition: 'the rendered projected volume requests a ServiceAccount token' });
      }
    }
    if (object.kind === 'Ingress' && object.spec?.ingressClassName) records.push({ ...base, dependency: `ingress-class:${object.spec.ingressClassName}`,
      dependencyIdentity: `ingress-class:${object.spec.ingressClassName}`, signal: `ingressClassName=${object.spec.ingressClassName}`,
      classification: 'ingress-controller', activationState: 'active', activationCondition: 'the rendered Ingress selects this class' });
    if (object.kind === 'PersistentVolumeClaim') records.push({ ...base, dependency: `storage-class:${object.spec?.storageClassName ?? '<default>'}`,
      dependencyIdentity: `storage-class:${object.spec?.storageClassName ?? '<default>'}`, signal: `PersistentVolumeClaim/${object.metadata.name}`,
      classification: 'persistent-storage', activationState: 'active', activationCondition: 'the rendered PersistentVolumeClaim exists' });
    if (object.kind === 'ConfigMap') for (const [key, raw] of Object.entries(object.data ?? {})) {
      if (/^(?:knip|package(?:-lock)?|tsconfig|eslint[^/]*)\.json$/iu.test(key)) continue;
      for (const item of parsedConfigStrings(raw, key)) {
      records.push(...dependencyRecordsForValue(item.key, item.value, base, 'configuration-signal', signalText(item.key, item.value), 'active',
        `${item.key} is present in the rendered ConfigMap`));
      addUrlSignals(records, item.key, item.value, base);
      }
    }
    if (object.kind === 'Application') for (const item of stringsIn(object.spec ?? {})) {
      records.push(...dependencyRecordsForValue(item.key, item.value, base, 'application-source', `${item.key}=${item.value}`));
      addUrlSignals(records, item.key, item.value, base);
    }
  }
  const unique = new Map();
  for (const discovered of records) {
    const activated = discovered.renderActivationState === 'conditional' && discovered.activationState === 'active'
      ? { ...discovered, activationState: 'conditional', activationCondition: discovered.renderActivationCondition }
      : discovered;
    const fixture = activated.fixtureOverrides?.find((override) =>
      override.signalPrefixes?.some((prefix) => activated.signal.startsWith(prefix)));
    const { fixtureOverrides, renderActivationState, renderActivationCondition, ...record } = fixture ? {
      ...activated,
      classification: `render-fixture:${discovered.classification}`,
      activationState: 'fixture-only',
      activationCondition: fixture.reason,
      source: fixture.source,
      line: undefined,
    } : activated;
    const key = [record.consumer, record.dependencyIdentity, record.classification, record.signal, record.origin].join('\0');
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()].sort((a, b) => a.consumer.localeCompare(b.consumer) || a.dependencyIdentity.localeCompare(b.dependencyIdentity)
    || a.classification.localeCompare(b.classification) || a.signal.localeCompare(b.signal));
}

export const discoverRuntimeDependencies = discoverRuntimeDependencySignals;

function parseObjects(source, origin) {
  return YAML.parseAllDocuments(source).flatMap((document) => document.errors.length || !document.toJSON() ? [] : [{ value: document.toJSON(), origin, source: origin }]);
}

/** Focused executable checks. These use real Prism handlers and rendered/static Kubernetes objects. */
export function selfTest(root = path.resolve(import.meta.dirname, '..')) {
  const prismSources = fs.readdirSync(path.join(root, 'skills/prism/server')).filter((name) => /\.(?:ts|mjs|js)$/u.test(name))
    .map((name) => path.join(root, 'skills/prism/server', name));
  const routes = discoverServerRoutes(prismSources);
  const route = (method, routePath) => routes.find((item) => item.method === method && item.path === routePath);
  assert(route('POST', '/v1/session'));
  assert(route('GET', '/v1/projects/{projectId:[0-9a-f-]+}/brief'));
  assert.equal(route('GET', '/v1/agent/jobs/{jobId:[0-9a-f-]+}')?.activationState, 'active');
  assert.equal(route('POST', '/v1/agent/jobs/{jobId:[0-9a-f-]+}/finish')?.activationState, 'active');
  assert.equal(route('POST', '/v1/agent/jobs/{jobId:[0-9a-f-]+}'), undefined);
  assert.equal(route('POST', '/v1/documents/{documentId:[0-9a-f-]+}/revisions'), undefined);
  assert.equal(route('POST', '/v1/artifacts/{artifactId:sha256:[a-f0-9]{64}}'), undefined);
  assert(!routes.some((item) => item.path.startsWith('/v1/demo-product/')), 'outbound Product Controller paths entered the server inventory');
  const studioRoutes = discoverServerRoutes([path.join(root, 'skills/prism/server/studio-request.ts')]);
  assert(studioRoutes.some((item) => item.method === 'ANY' && item.path === '/v1/*' && item.pathKind === 'prefix'));
  const studioFallback = studioRoutes.find((item) => item.method === 'ANY' && item.path === '/*');
  assert.equal(studioFallback?.pathKind, 'fallback');
  assert.equal(studioFallback?.classification, 'server-static-fallback');
  assert.equal(studioFallback?.routeRole, 'static-spa-fallback');
  assert.deepEqual(studioFallback?.excludedPaths, ['/health', '/ready']);
  assert.deepEqual(studioFallback?.excludedPrefixes, ['/v1/']);
  assert.equal(studioFallback?.activationState, 'active');
  const prefixNegative = discoverServerRoutes([{ source: 'prefix-negative.ts', text: `function observe(request,response){console.log(request.url,response.statusCode);}
    function handler(request,response,url){
    if(url.pathname.startsWith('/v1/')) observe(request,response);
    else response.end('static');
  }` }]);
  assert.equal(prefixNegative.some((item) => item.path === '/v1/*'), false, 'a prefix observation is not a forwarding boundary');
  const fallbackNegative = discoverServerRoutes([{ source: 'fallback-negative.ts', text: `
    async function proxy(request,response){const upstream=await fetch('https://example.invalid');response.end(await upstream.text());}
    async function pretendStatic(url,response){response.end(url.pathname);}
    async function handler(request,response,url){
      if(url.pathname.startsWith('/v1/')) await proxy(request,response);
      else await pretendStatic(url,response);
    }
  ` }]);
  assert(fallbackNegative.some((item) => item.path === '/v1/*'), 'the negative fixture must retain its real forwarding prefix');
  assert.equal(fallbackNegative.some((item) => item.path === '/*'), false,
    'a generic else response must not be fabricated as a static SPA fallback');
  const opsRoutes = discoverServerRoutes([path.join(root, 'tools/ops-mcp/src/server.mjs')]);
  assert(opsRoutes.some((item) => item.method === 'ANY' && item.path === '/mcp'));
  const busterRoutes = discoverServerRoutes([path.join(root, 'skills/buster/engine/test-gates/remote-plan-http.ts')]);
  const busterPath = (method, routePath) => busterRoutes.find((item) => item.method === method && item.path === routePath);
  const jobPath = '/v1/plan-jobs/{jobId:[^/?#]+}';
  const evidencePath = `${jobPath}/evidence/{digest:(?:sha256%3A|sha256:)[a-f0-9]{64}}`;
  const resultPath = `${jobPath}/results/{digest:(?:sha256%3A|sha256:)[a-f0-9]{64}}`;
  assert(busterPath('POST', '/v1/plan-jobs'));
  assert(busterPath('GET', jobPath));
  assert(busterPath('DELETE', jobPath));
  assert(busterPath('GET', evidencePath));
  assert(busterPath('GET', resultPath));
  assert.equal(busterPath('POST', jobPath), undefined);
  assert.equal(busterPath('DELETE', evidencePath), undefined);
  assert.equal(busterPath('DELETE', resultPath), undefined);
  assert.equal(busterPath('GET', '/v1/plan-jobs'), undefined);
  const outbound = discoverOutboundConnections([path.join(root, 'skills/prism/server/product-decisions.ts')]);
  assert.deepEqual(outbound.filter((item) => item.callee === 'productController').map((item) => item.target),
    ['/v1/demo-product/status', '/v1/demo-product/decisions', '/v1/demo-product/subjects']);
  assert(outbound.filter((item) => item.callee === 'productController').every((item) => item.method === 'POST' && item.caller && item.source && item.line));
  const novaOutbound = discoverOutboundConnections([
    path.join(root, 'skills/nova/core/test-gates/remote-dispatch.ts'),
    path.join(root, 'skills/nova/core/test-gates/http-response.ts'),
  ]);
  const hasOutbound = (records, method, target) => records.some((item) => item.method === method && item.target === target);
  assert(hasOutbound(novaOutbound, 'POST', '/v1/plan-jobs'));
  assert(hasOutbound(novaOutbound, 'GET', '/v1/plan-jobs/{jobId}'));
  assert(hasOutbound(novaOutbound, 'DELETE', '/v1/plan-jobs/{jobId}'));
  assert(hasOutbound(novaOutbound, 'GET', '/v1/plan-jobs/{jobId}/evidence/{contentDigest}'));
  assert(hasOutbound(novaOutbound, 'GET', '/v1/plan-jobs/{jobId}/results/{contentDigest}'));
  assert(!novaOutbound.some((item) => item.method === 'POST' && item.target.includes('/evidence/')));
  assert(!novaOutbound.some((item) => item.method === 'DELETE' && item.target.includes('/results/')));
  const prismAgentOutbound = discoverOutboundConnections([
    path.join(root, 'skills/prism/server/agent-job-runner.mjs'),
    path.join(root, 'skills/prism/server/agent-bridge.mjs'),
  ]);
  assert(hasOutbound(prismAgentOutbound, 'POST', '/v1/agent/jobs/claim'));
  assert(hasOutbound(prismAgentOutbound, 'GET', '/v1/agent/jobs/{payload.jobId}'));
  assert(hasOutbound(prismAgentOutbound, 'POST', '/v1/agent/jobs/{job.id}/finish'));
  const workerOutbound = discoverOutboundConnections([path.join(root, 'skills/prism/control/worker-operation-transport.ts')]);
  assert(hasOutbound(workerOutbound, 'POST', '/v1/attempts'));
  const artifactOutbound = discoverOutboundConnections([path.join(root, 'skills/prism/server/worker-artifacts.ts')]);
  assert(hasOutbound(artifactOutbound, 'GET', '/v1/internal/artifacts/{artifact.contentDigest}'));
  assert(hasOutbound(artifactOutbound, 'POST', '/v1/internal/artifacts/{contentDigest}'));
  const registryOutbound = discoverOutboundConnections([path.join(root, 'skills/buster/engine/test-gates/container-build-runtime.ts')]);
  assert(registryOutbound.some((item) => item.method === 'GET' && item.target.includes('/manifests/{digest}')));
  const busterNetworkOutbound = discoverOutboundConnections([
    path.join(root, 'skills/buster/engine/test-gates/network-http-runtime.ts'),
  ]);
  const busterNetworkFamily = busterNetworkOutbound.find((item) => item.providerFamily === 'buster-network-http');
  assert.equal(busterNetworkFamily?.method, 'DYNAMIC');
  assert.equal(busterNetworkFamily?.path, '{configuredUrl}');
  assert.equal(busterNetworkFamily?.classification, 'dynamic-provider-http');
  assert.equal(busterNetworkFamily?.providerClassification, 'network.http');
  assert.equal(busterNetworkFamily?.activationState, 'active');
  const commonNetworkOutbound = discoverOutboundConnections([
    path.join(root, 'skills/common/plugins/network-http/src/adapter.ts'),
  ]);
  const commonNetworkFamily = commonNetworkOutbound.find((item) => item.providerFamily === 'common-network-http-adapter');
  assert.equal(commonNetworkFamily?.method, 'DYNAMIC');
  assert.equal(commonNetworkFamily?.path, '{configuredUrl}');
  assert.equal(commonNetworkFamily?.classification, 'dynamic-provider-http');
  assert.equal(commonNetworkFamily?.providerClassification, 'network.http');
  assert.equal(commonNetworkFamily?.activationState, 'active');
  const kubernetesOutbound = discoverOutboundConnections([path.join(root, 'tools/ops-mcp/src/kubernetes.mjs')]);
  const kubernetesFamily = kubernetesOutbound.find((item) => item.providerFamily === 'ops-mcp-kubernetes-client');
  assert.equal(kubernetesFamily?.method, 'GET');
  assert.equal(kubernetesFamily?.path, '{kubernetesApiPath}');
  assert.equal(kubernetesFamily?.base, '{configuredKubernetesApiOrigin}');
  assert.equal(kubernetesFamily?.classification, 'dynamic-provider-http');
  assert.equal(kubernetesFamily?.providerClassification, 'kubernetes-api');
  assert.equal(kubernetesFamily?.activationState, 'active');
  const goRoutes = discoverGoServerRoutes([
    path.join(root, 'cmd/buster-namespace-controller/demo-readiness.go'),
    path.join(root, 'cmd/buster-namespace-controller/demo-product.go'),
  ], {
    activationFor: ({ path: routePath }) => routePath.startsWith('/v1/demo-product/')
      ? { activationState: 'conditional', activationCondition: 'ready listener and product decisions enabled' }
      : { activationState: 'conditional', activationCondition: 'readiness listener enabled' },
  });
  assert(goRoutes.some((item) => item.method === 'POST' && item.path === '/v1/demo-ready'));
  assert(goRoutes.some((item) => item.method === 'POST' && item.path === '/v1/demo-ready/status'));
  assert(goRoutes.some((item) => item.method === 'POST' && item.path === '/v1/demo-product/subjects'));
  assert(goRoutes.some((item) => item.method === 'POST' && item.path === '/v1/demo-product/decisions'));
  assert(goRoutes.some((item) => item.method === 'POST' && item.path === '/v1/demo-product/status'));
  assert(goRoutes.every((item) => item.activationState === 'conditional'));
  assert(goRoutes.filter((item) => item.path.startsWith('/v1/demo-product/'))
    .every((item) => item.activationCondition === 'ready listener and product decisions enabled'));
  const goKubernetes = discoverGoKubernetesConnections([
    path.join(root, 'cmd/buster-namespace-controller/demo-readiness.go'),
    path.join(root, 'cmd/buster-namespace-controller/demo-readiness-sources.go'),
  ]);
  assert(goKubernetes.some((item) => item.method === 'POST' && item.target === '/apis/authentication.k8s.io/v1/tokenreviews'));
  assert(goKubernetes.some((item) => item.method === 'GET' && item.target.includes('/api/v1/namespaces/{namespace}/secrets/')));
  const demoHandoffOutbound = discoverOutboundConnections([
    path.join(root, 'skills/nova/plugins/demo-handoff/src/controller-client.ts'),
  ]);
  assert(demoHandoffOutbound.some((item) => item.method === 'POST' && item.target === '/v1/demo-ready'));
  assert(demoHandoffOutbound.some((item) => item.method === 'POST' && item.target === '/v1/demo-ready/status'));
  assert(demoHandoffOutbound.filter((item) => item.target.startsWith('/v1/demo-ready')).every((item) => item.activationState === 'conditional'));
  const variableOutbound = discoverOutboundConnections([{ source: 'outbound-values.ts', text: `
    const origin='https://example.invalid';
    async function send(path,verb){const target=new URL(path,origin);const requestOptions={method:verb};return fetch(target,requestOptions);}
    send('/v1/things','PATCH');
    const unused=new URL('/v1/not-called',origin);
    fetch('/v1/dynamic',{method:process.env.METHOD});
    function unrelated(){const hiddenOptions={method:'DELETE'};return hiddenOptions;}
    fetch('/v1/no-cross-scope',hiddenOptions);
  ` }]);
  assert(hasOutbound(variableOutbound, 'PATCH', '/v1/things'));
  assert(hasOutbound(variableOutbound, 'DYNAMIC', '/v1/dynamic'));
  assert(!hasOutbound(variableOutbound, 'GET', '/v1/dynamic'), 'a dynamic method must not be fabricated as GET');
  assert(hasOutbound(variableOutbound, 'DYNAMIC', '/v1/no-cross-scope'), 'an out-of-scope options binding must stay dynamic');
  assert(!hasOutbound(variableOutbound, 'DELETE', '/v1/no-cross-scope'), 'options must not leak across lexical function scopes');
  assert(!variableOutbound.some((item) => item.target === '/v1/not-called'), 'constructing a URL is not an outbound call');
  const dynamicNegative = discoverOutboundConnections([{ source: 'dynamic-provider-negative.ts', text: `
    async function invoke(config) { return fetch(config.url, { method: config.method }); }
  ` }]);
  assert.equal(dynamicNegative.length, 0,
    'an arbitrary dynamic fetch must not become an active configured provider family');
  const providerShapeNegative = discoverOutboundConnections([{
    source: 'skills/common/plugins/network-http/src/adapter.ts',
    text: `async function performRequest(url) { return fetch(url); }`,
  }]);
  assert.equal(providerShapeNegative.length, 0,
    'a provider filename without the production method-and-target call shape must not create a dynamic family');
  const contradictory = discoverServerRoutes([{ source: 'contradiction.ts', text: `function handler(request,response,url){
    if(!url.pathname.startsWith('/v1/agent/job/')) return false;
    const match=/^\\/v1\\/agent\\/jobs\\/([0-9a-f-]+)$/.exec(url.pathname);
    if(match && request.method==='GET') response.end(match[1]);
  }` }]);
  assert.equal(contradictory[0]?.activationState, 'unreachable');
  assert.match(contradictory[0]?.reason ?? '', /guard requires prefix/u);

  const rendered = [];
  const helm = (name, chart, values = [], sets = []) => {
    const args = ['template', name, chart];
    for (const value of values) args.push('-f', value);
    for (const setting of sets) args.push('--set-string', setting);
    return execFileSync('helm', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  };
  rendered.push(...parseObjects(helm('agent-buster', 'charts/kubeclaw', ['my-values/buster-values.yaml'], [
    'runtimeInfrastructure.registry.endpoint=http://registry-local.kubeclaw.svc.cluster.local:5001',
    'runtimeInfrastructure.registry.transport=http-lab',
  ]), 'helm:buster'));
  rendered.push(...parseObjects(helm('agent-prism', 'charts/kubeclaw', ['my-values/prism-agent-values.yaml']), 'helm:prism-agent'));
  rendered.push(...parseObjects(helm('prism', 'charts/prism', ['my-values/prism-values.yaml'], [
    'worker.native.namespace=kubeclaw', 'worker.native.nodeName=source-discovery', `worker.native.policyDigest=${'a'.repeat(64)}`,
  ]), 'helm:prism'));
  for (const relative of ['my-values/infra/litellm-deployment.yaml', 'my-values/infra/litellm-config.yaml',
    'my-values/infra/registry-local.yaml', 'my-values/infra/registry-mirror.yaml', 'my-values/infra/argocd-tailscale-ingress.yaml',
    'gitops/platform/litellm/resources.yaml']) {
    rendered.push(...parseObjects(fs.readFileSync(path.join(root, relative), 'utf8'), relative));
  }
  const dependencies = discoverRuntimeDependencySignals(rendered);
  const identities = new Set(dependencies.filter((item) => item.activationState === 'active').map((item) => item.dependencyIdentity));
  for (const expected of ['openai', 'vertex-ai', 'discord', 'ghcr.io', 'docker.io', 'redis', 'postgresql', 'litellm', 'ingress-class:tailscale', 'registry-local', 'buildkit']) {
    assert(identities.has(expected), `missing real rendered dependency signal: ${expected}`);
  }
  assert(!identities.has('model:True'), 'STORE_MODEL_IN_DB must not be interpreted as a configured model');
  const semanticNegatives = discoverRuntimeDependencySignals([{
    apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'negative-config', namespace: 'test' }, data: {
      'openclaw.json': JSON.stringify({ gateway: { tailscale: { mode: 'off' } } }),
      'knip.json': JSON.stringify({ workspaces: { redisTransport: { entry: ['src/adapter.ts', 'tests/**/*.ts'] }, tailscaleExposure: { project: ['src/**/*.ts'] } } }),
    },
  }]);
  assert(!semanticNegatives.some((item) => ['redis', 'tailscale'].includes(item.dependencyIdentity)),
    'disabled feature flags and developer-only source globs must not become active runtime dependencies');
  const multiline = discoverRuntimeDependencySignals([{
    apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'multiline-config', namespace: 'test' },
    data: { 'runtime.yaml': `model_list:\n  - model_name: example\n    litellm_params:\n      model: openai/example\n${'x'.repeat(240)}` },
  }]);
  assert(multiline.length > 0, 'the multiline fixture must produce at least one semantic dependency');
  assert(multiline.every((item) => !/[\r\n]/u.test(item.signal) && item.signal.length <= 220),
    'rendered dependency signals must be concise single-line table values');
  return { ok: true, routes: routes.length + studioRoutes.length + opsRoutes.length + busterRoutes.length,
    outbound: outbound.length + novaOutbound.length + prismAgentOutbound.length + workerOutbound.length + artifactOutbound.length
      + registryOutbound.length + busterNetworkOutbound.length + commonNetworkOutbound.length + kubernetesOutbound.length,
    dependencies: dependencies.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename) && process.argv.includes('--self-test')) {
  process.stdout.write(`${JSON.stringify(selfTest())}\n`);
}
