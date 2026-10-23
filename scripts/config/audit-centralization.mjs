// Read-only discovery: candidates require semantic review, not a claim that every number is config.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '../..');
const files = execFileSync('rg', ['--files', 'skills', 'scripts', 'contracts'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(file => /\.(?:ts|mts|mjs|js)$/.test(file)
    && !/(?:^|\/)(?:tests?|fixtures?|integration|dist|node_modules|generated|spikes)(?:\/|\.)/.test(file)
    && !/\.(?:test|spec|d)\.(?:ts|mts|mjs|js)$/.test(file) && !file.startsWith('scripts/config/')).sort();
const settingName = /timeout|deadline|retries|retryCount|retryAttempts|interval|backoff|batchSize|concurrency|retention|(?:maximum|max|minimum|min).*(?:bytes|files|records|connections|requests|tokens|attempts|documents|jobs|buffer|output|evidence|logs)|memoryBytes|wallTimeMs|cpuMillis/i;
const candidates = [];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const found = new Set();
  function literalExpression(node) {
    return ts.isNumericLiteral(node) || ((ts.isPrefixUnaryExpression(node) || ts.isParenthesizedExpression(node)) && literalExpression(node.operand ?? node.expression))
      || (ts.isBinaryExpression(node) && literalExpression(node.left) && literalExpression(node.right));
  }
  function add(node, expression, name, kind) {
    if (!expression || !literalExpression(expression) || found.has(expression.pos)) return;
    found.add(expression.pos);
    candidates.push({ path: file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      name, expression: expression.getText(source), kind, status: 'requires-semantic-review' });
  }
  function visit(node) {
    if ((ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.name && settingName.test(node.name.getText(source))) {
      add(node, node.initializer, node.name.getText(source), ts.isParameter(node) ? 'parameter-default' : 'named-literal');
    }
    if (ts.isBinaryExpression(node) && ['??', '||'].includes(node.operatorToken.getText(source))
      && settingName.test(node.left.getText(source))) {
      add(node, node.right, node.left.getText(source), 'inline-fallback');
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (/^(?:setTimeout|setInterval)$/.test(name)) add(node, node.arguments[1], name, 'timer-call');
      if (name === 'AbortSignal.timeout') add(node, node.arguments[0], name, 'timer-call');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const authoredNumericLeaves = [];
function walk(value, pointer, file) {
  if (typeof value === 'number') authoredNumericLeaves.push({ file, pointer, value });
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`, file);
}
for (const file of ['config/pipeline.config.json', ...fs.readdirSync(path.join(root, 'config/components')).filter(f => f.endsWith('.json')).map(f => `config/components/${f}`)]) {
  walk(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), '', file);
}
process.stdout.write(JSON.stringify({ schemaVersion: 1, observedAt: new Date().toISOString(),
  scope: 'current central entry/components and numeric candidates in production skills/scripts/contracts',
  qualification: 'Discovery only. Numeric leaf count is not settings migrated; profiles may repeat values. Candidates are not all confirmed settings. Existing central files outside config/components, string/boolean/ENV settings, SQL/embedded code, dynamic expressions and deployment YAML need separate review. No completeness percentage or acceptance.',
  productionFilesScanned: files.length, authoredNumericLeafCount: authoredNumericLeaves.length,
  candidateCount: candidates.length, authoredNumericLeaves, candidates }, null, 2) + '\n');
