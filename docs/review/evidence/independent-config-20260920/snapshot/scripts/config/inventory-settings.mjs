// Discovery inventory, not a claim that every candidate is an operator setting.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import yaml from 'js-yaml';
const root = path.resolve(import.meta.dirname, '../..');
const files = execFileSync('rg', ['--files', 'skills', 'charts', 'my-values', 'scripts', 'gitops'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(p => !/(?:^|\/)(?:tests?|integration|evidence|dist|node_modules)(?:\/|\.)/.test(p));
const entries = [];
function unit(name) {
  if (/Bytes$|_BYTES$/.test(name)) return 'bytes';
  if (/Ms$|Millis$|_MS$/.test(name)) return 'milliseconds';
  if (/Seconds$|_SECONDS$/.test(name)) return 'seconds';
  if (/Millicores$/.test(name)) return 'millicores';
  if (/tasks$|_TASKS$/.test(name)) return 'Linux tasks (threads including process main thread)';
  if (/Processes$/.test(name)) return 'historical process count; not tasks';
  return 'requires semantic review';
}
function add(source, name, value, type, consumer, mechanism, line) {
  const secret = /password|secret|token|private.key|credential/i.test(name);
  entries.push({ source, ...(line ? { line } : {}), name, type, unit: unit(name),
    default: secret ? '(redacted; classify reference versus secret value)' : value,
    override: mechanism, consumer, classification: 'unresolved', resolutionRequired: secret ? 'secret reference/value distinction' : 'operator setting versus protocol/version/runtime-derived value' });
}
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if ((/^charts\/[^/]+\/values.yaml$/.test(file) || /^my-values\/.*\.yaml$/.test(file) || /^gitops\/.*config.json$/.test(file))) {
    let documents;
    try { documents = file.endsWith('.json') ? [JSON.parse(text)] : yaml.loadAll(text); } catch { continue; }
    function walk(value, keys = []) {
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
        for (const [key, child] of Object.entries(value)) walk(child, [...keys, key]);
      } else add(file, keys.join('.'), value, value === null ? 'null/unset' : Array.isArray(value) ? 'array' : typeof value, file.startsWith('charts/') ? `${file.split('/').slice(0, 2).join('/')}/templates/* (exact binding pending)` : 'installer/Helm binding pending', 'Helm values layering or explicitly selected host file');
    }
    documents.forEach(document => walk(document));
  }
  if (!/\.(?:ts|mts|mjs|js)$/.test(file) || file === 'scripts/config/inventory-settings.mjs') continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && ['process.env', 'environment', 'env'].includes(node.expression.getText(source))) {
      const parent = node.parent;
      const fallback = ts.isBinaryExpression(parent) && ['??', '||'].includes(parent.operatorToken.getText(source)) ? parent.right.getText(source) : '(no local default at this read)';
      add(file, node.name.text, fallback, 'environment string; parse at consumer', `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`, 'environment; precedence unresolved', source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    }
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) && /^[A-Z][A-Z0-9_]+$/.test(node.arguments[0].text)) {
      add(file, node.arguments[0].text, node.arguments[1]?.getText(source) ?? '(required/derived)', 'helper call; validation review required', `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`, `helper ${node.expression.getText(source)}`, source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
process.stdout.write(JSON.stringify({ schemaVersion: 1, status: 'discovery; not F1 complete', excluded: ['test/integration paths', 'generated dist', 'dynamic environment names require manual callsite resolution', 'arbitrary hardcoded literals require semantic source review', 'template constants require semantic review'], entries }, null, 2) + '\n');
