import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import YAML from 'yaml';

// Read declarations, never import a runtime owner or evaluate its expressions.
// Selectors name a reviewed authority. They are not a persistence/GC detector.
const digest = text => createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(`DOC_DRIFT_STORE_POLICY: ${message}`); };

function named(node, name, file) {
  return node.name && node.name.getText(file) === name;
}

function staticNumber(node) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    return staticNumber(node.expression);
  }
  if (ts.isParenthesizedExpression(node)) return staticNumber(node.expression);
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text);
    return Number.isSafeInteger(value) ? value : undefined;
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const value = staticNumber(node.operand);
    if (value === undefined) return undefined;
    if (node.operator === ts.SyntaxKind.MinusToken) return -value;
    if (node.operator === ts.SyntaxKind.PlusToken) return value;
  }
  if (ts.isBinaryExpression(node)) {
    const left = staticNumber(node.left), right = staticNumber(node.right);
    if (left === undefined || right === undefined) return undefined;
    const operations = new Map([
      [ts.SyntaxKind.PlusToken, () => left + right],
      [ts.SyntaxKind.MinusToken, () => left - right],
      [ts.SyntaxKind.AsteriskToken, () => left * right],
      [ts.SyntaxKind.SlashToken, () => left / right],
    ]);
    const result = operations.get(node.operatorToken.kind)?.();
    return Number.isFinite(result) && Number.isSafeInteger(result) ? result : undefined;
  }
  return undefined;
}

function staticLiteral(node, file) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    return staticLiteral(node.expression, file);
  }
  const number = staticNumber(node);
  if (number !== undefined) return number;
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'Object.freeze'
    && node.arguments.length === 1) return staticLiteral(node.arguments[0], file);
  if (ts.isObjectLiteralExpression(node)) {
    if (node.properties.some(property => !ts.isPropertyAssignment(property)
      || !ts.isIdentifier(property.name))) return undefined;
    const names = node.properties.map(property => property.name.text);
    if (new Set(names).size !== names.length) return undefined;
    const values = node.properties.map(property => staticLiteral(property.initializer, file));
    if (values.some(value => value === undefined)) return undefined;
    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
  }
  return undefined;
}

export function extractStorePolicySource(sourcePath, text, selector) {
  assert(typeof text === 'string' && typeof sourcePath === 'string');
  const fields = {
    typescript: ['kind', 'variable', 'function', 'class', 'member', 'property',
      'call', 'construct', 'argument', 'firstArgument', 'literalRequired'],
    yaml: ['kind', 'path'], 'complete-source': ['kind'],
  }[selector?.kind];
  if (!fields || Object.keys(selector).some(key => !fields.includes(key))) fail(`unsupported source selector: ${sourcePath}`);
  let start = 0, end = text.length, value, fallbackExpression, fallbackValue,
    representation = 'source-declaration';
  if (selector.kind === 'typescript') {
    const file = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true,
      /\.tsx$/u.test(sourcePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if (file.parseDiagnostics.length) fail(`unparseable TypeScript authority: ${sourcePath}`);
    const matches = [];
    function visit(node) {
      if (selector.variable && ts.isVariableDeclaration(node) && named(node, selector.variable, file)) {
        matches.push(node.initializer ?? node);
      } else if (selector.function && ts.isFunctionDeclaration(node) && named(node, selector.function, file)) {
        matches.push(node);
      } else if (selector.class && ts.isClassDeclaration(node) && named(node, selector.class, file)) {
        if (selector.member === undefined) matches.push(node);
        else for (const member of node.members) {
          if ((selector.member === 'constructor' && ts.isConstructorDeclaration(member))
            || named(member, selector.member, file)) matches.push(member);
        }
      }
      ts.forEachChild(node, visit);
    }
    const keys = ['variable', 'function', 'class'].filter(key => typeof selector[key] === 'string');
    if (keys.length !== 1 || (selector.member !== undefined && !selector.class)) {
      fail(`invalid TypeScript selector: ${sourcePath}`);
    }
    visit(file);
    if (matches.length !== 1) fail(`expected one authority, found ${matches.length}: ${sourcePath}`);
    let selected = matches[0];
    const invocation = selector.call ?? selector.construct;
    if (invocation !== undefined) {
      if (selector.call && selector.construct || typeof invocation !== 'string'
        || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(invocation)
        || !Number.isSafeInteger(selector.argument) || selector.argument < 0
        || selector.firstArgument !== undefined && typeof selector.firstArgument !== 'string') {
        fail(`invalid invocation selector: ${sourcePath}`);
      }
      const calls = [];
      function findCall(node) {
        const matchesKind = selector.construct ? ts.isNewExpression(node) : ts.isCallExpression(node);
        if (matchesKind && ts.isIdentifier(node.expression) && node.expression.text === invocation
          && (selector.firstArgument === undefined || node.arguments?.[0]
            && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === selector.firstArgument)) calls.push(node);
        ts.forEachChild(node, findCall);
      }
      findCall(selected);
      if (calls.length !== 1 || !calls[0].arguments?.[selector.argument]) {
        fail(`expected one selected invocation argument, found ${calls.length}: ${sourcePath}`);
      }
      if (calls[0].arguments.some(argument => ts.isSpreadElement(argument))) {
        fail(`spread arguments have no fixed policy argument position: ${sourcePath}`);
      }
      selected = calls[0].arguments[selector.argument];
    } else if (selector.argument !== undefined || selector.firstArgument !== undefined) {
      fail(`argument selector requires a named invocation: ${sourcePath}`);
    }
    if (selector.property !== undefined) {
      if ((!selector.variable && invocation === undefined) || !Array.isArray(selector.property) || !selector.property.length) {
        fail(`invalid property selector: ${sourcePath}`);
      }
      for (const name of selector.property) {
        while (ts.isAsExpression(selected) || ts.isSatisfiesExpression(selected) || ts.isTypeAssertionExpression(selected)) {
          selected = selected.expression;
        }
        if (ts.isCallExpression(selected) && selected.expression.getText(file) === 'Object.freeze'
          && selected.arguments.length === 1) selected = selected.arguments[0];
        if (!ts.isObjectLiteralExpression(selected)) fail(`unsupported policy object: ${sourcePath}`);
        if (selected.properties.some(property => !ts.isPropertyAssignment(property)
          || !ts.isIdentifier(property.name))) {
          fail(`unsupported policy object member: ${sourcePath}`);
        }
        const names = selected.properties.map(property => property.name.text);
        if (new Set(names).size !== names.length) fail(`ambiguous policy object member: ${sourcePath}`);
        const properties = selected.properties.filter(property => ts.isPropertyAssignment(property)
          && property.name.getText(file) === name);
        if (properties.length !== 1) fail(`missing or ambiguous policy property: ${sourcePath} ${name}`);
        selected = properties[0].initializer;
      }
    }
    start = selected.getStart(file); end = selected.getEnd();
    if (selector.variable || invocation !== undefined) {
      value = staticLiteral(selected, file);
      if (value !== undefined) representation = invocation !== undefined ? 'literal-call-argument'
        : typeof value === 'number' ? 'static-number' : 'static-literal';
      let candidate = selected;
      if (ts.isCallExpression(candidate) && candidate.expression.getText(file) === 'Number'
        && candidate.arguments.length === 1) candidate = candidate.arguments[0];
      if (ts.isBinaryExpression(candidate) && candidate.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        fallbackExpression = candidate.right.getText(file);
        fallbackValue = staticLiteral(candidate.right, file);
        representation = 'configuration-nullish-fallback-expression';
      }
    }
    if (selector.literalRequired !== undefined && typeof selector.literalRequired !== 'boolean') {
      fail(`invalid literal requirement: ${sourcePath}`);
    }
    if (selector.literalRequired && value === undefined && fallbackValue === undefined) {
      fail(`selected default is not a supported literal declaration: ${sourcePath}`);
    }
  } else if (selector.kind === 'yaml') {
    if (!Array.isArray(selector.path) || !selector.path.length) fail(`invalid YAML selector: ${sourcePath}`);
    const documents = YAML.parseAllDocuments(text, { uniqueKeys: true });
    if (documents.length !== 1 || documents[0].errors.length) fail(`expected one valid YAML document: ${sourcePath}`);
    YAML.visit(documents[0], { Alias() { fail(`unsupported YAML alias authority: ${sourcePath}`); } });
    const node = documents[0].getIn(selector.path, true);
    if (!node || !Array.isArray(node.range)) fail(`missing YAML authority: ${sourcePath} ${selector.path.join('.')}`);
    start = node.range[0]; end = node.range[1];
    value = node.toJSON(); representation = 'declared-yaml-value';
  } else if (selector.kind !== 'complete-source') {
    fail(`unsupported source selector: ${sourcePath}`);
  }
  const expression = text.slice(start, end);
  if (!expression.trim()) fail(`empty policy authority: ${sourcePath}`);
  return {
    source: sourcePath,
    sourceSha256: digest(text),
    selector,
    startLine: text.slice(0, start).split('\n').length,
    endLine: text.slice(0, Math.max(start, end - 1)).split('\n').length,
    representation,
    expression,
    ...(value !== undefined ? { value } : {}),
    ...(fallbackExpression !== undefined ? { fallbackExpression } : {}),
    ...(fallbackValue !== undefined ? { fallbackValue } : {}),
  };
}
