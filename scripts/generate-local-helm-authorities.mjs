#!/usr/bin/env node
// Maintenance command for the exact local Helm authority registry. The normal
// documentation build reads the generated JSON and never uses a prior inventory.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputPath = path.join(root, 'scripts/docs-local-helm-field-authorities.json');
if (!fs.existsSync(outputPath)) throw new Error('exact local Helm authority registry is missing');
const approvedRegistry = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const candidateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-local-helm-authorities-'));
const candidate = spawnSync(process.execPath, [
  path.join(root, 'scripts/docs-configuration-inventory.mjs'),
  '--root', root,
  '--out-dir', candidateDirectory,
  '--allow-semantic-gaps',
  '--allow-local-helm-authority-maintenance',
], { cwd: root, encoding: 'utf8' });
if (candidate.status !== 0) throw new Error(`candidate local Helm inventory failed\n${candidate.stdout}\n${candidate.stderr}`);
const inventoryPath = path.join(candidateDirectory, 'configuration-values.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const runtimeInventory = JSON.parse(fs.readFileSync(path.join(candidateDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
const sourceDigest = (relative) => digest(fs.readFileSync(path.join(root, relative)));
const local = inventory.files.flatMap((file) => file.documents.flatMap((document) => document.fields
  .filter((field) => !['object', 'array'].includes(field.type)
    && ['template-render-authority', 'template-render-meaning-blocker', 'local-helm-field-authority'].includes(field.meaning?.status))
  .map((field) => ({ sourcePath: file.path, sourceClass: file.sourceClass, ...field }))));

const chartRootFor = (sourcePath) => {
  if (sourcePath.startsWith('charts/')) return sourcePath.split('/').slice(0, 2).join('/');
  if (sourcePath === 'my-values/prism-values.yaml') return 'charts/prism';
  return 'charts/kubeclaw';
};
const words = (value) => value.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/[-_]/gu, ' ').toLowerCase();
const fieldPathTokens = (value) => [...value.replace(/^\$/u, '').matchAll(/\.([^.[\]]+)|\["((?:\\.|[^"])*)"\]|\['((?:\\.|[^'])*)'\]|\[([0-9]+)\]/gu)]
  .map((match) => match[1] ?? (match[2] !== undefined ? JSON.parse(`"${match[2]}"`) : undefined)
    ?? match[3]?.replaceAll("\\'", "'").replaceAll('\\\\', '\\') ?? Number(match[4]));
const cleanPath = (value) => fieldPathTokens(value).filter((token) => typeof token === 'string').join('.');
const context = (fieldPath) => fieldPathTokens(fieldPath).slice(0, -1).map((token) => typeof token === 'number' ? String(token) : words(token)).join(' / ');
const leaf = (fieldPath) => words(String(fieldPathTokens(fieldPath).at(-1)));
const selected = (field) => JSON.stringify(field.value);
const consumerFiles = (field) => [...new Set(field.consumers.map((item) => item.path))].sort();
const renderedTargets = (field) => consumerFiles(field).map((item) => path.basename(item, path.extname(item))).join(', ');
const subject = (field) => `the ${context(field.path) || chartRootFor(field.sourcePath)} setting`;
const parsedSources = new Map();
const parsedSource = (sourcePath) => {
  if (!parsedSources.has(sourcePath)) parsedSources.set(sourcePath, YAML.parse(fs.readFileSync(path.join(root, sourcePath), 'utf8')));
  return parsedSources.get(sourcePath);
};
const valueAtExactPath = (value, fieldPath) => {
  return fieldPathTokens(fieldPath).reduce((current, token) => current?.[token], value);
};
const environmentEntry = (field) => {
  const exactPath = field.path.replace(/^\$\.?/u, '');
  const match = exactPath.match(/^(.*env\[[0-9]+\])(?:\..*)?$/iu);
  if (!match) return null;
  const entry = valueAtExactPath(parsedSource(field.sourcePath), `$.${match[1]}`);
  return entry && typeof entry.name === 'string' ? entry : null;
};
const runtimeEnvironmentContract = (field) => {
  const entry = environmentEntry(field);
  if (!entry) return null;
  const contract = runtimeInventory.environment.find((item) => item.name === entry.name);
  if (!contract) return null;
  const runtimeReaders = contract.consumers.filter((consumer) => consumer.path !== field.sourcePath
    && consumer.access !== 'kubernetes-env');
  return { entry, contract, runtimeReaders };
};
const helmControlFrames = (lines, targetLine, sourceLine) => {
  const frames = [];
  const applyTokens = (line, lineNumber, limit = line.length) => {
    const tokenPattern = /\{\{-?\s*(else\s+if|define|if|with|range|else|end)\b([^}]*)-?\}\}/gu;
    for (const match of line.matchAll(tokenPattern)) {
      if ((match.index ?? 0) >= limit) break;
      const command = match[1].replace(/\s+/gu, ' ');
      const expression = match[2].trim();
      if (['define', 'if', 'with', 'range'].includes(command)) {
        frames.push({ kind: command, startLine: lineNumber, expression, branch: command, branchLine: lineNumber, branchExpression: expression });
      } else if (command === 'else if') {
        if (!frames.length) throw new Error(`unmatched Helm else-if at line ${lineNumber}`);
        const frame = frames.at(-1);
        frame.branch = 'else-if';
        frame.branchLine = lineNumber;
        frame.branchExpression = expression;
      } else if (command === 'else') {
        if (!frames.length) throw new Error(`unmatched Helm else at line ${lineNumber}`);
        const frame = frames.at(-1);
        frame.branch = 'else';
        frame.branchLine = lineNumber;
        frame.branchExpression = `not (${frame.expression})`;
      } else if (command === 'end') {
        if (frames.length) frames.pop();
      }
    }
  };
  for (let index = 0; index < targetLine - 1; index += 1) applyTokens(lines[index], index + 1);
  const valueOffset = Math.max(0, sourceLine.search(/(?:\.Values|index\s+\$?\.Values)/u));
  applyTokens(sourceLine, targetLine, /\{\{-?\s*(?:else\s+if|if|with|range)\b/u.test(sourceLine) ? sourceLine.length : valueOffset);
  return frames.filter((frame) => frame.kind !== 'define');
};
const receiverEntry = (receiverPath, receiverLines, line, relation) => ({
  path: receiverPath,
  line,
  relation,
  expression: (receiverLines[line - 1] ?? '').trim().slice(0, 240),
  sourceLineSha256: digest(receiverLines[line - 1] ?? ''),
});
const yamlReceiverAt = (lines, startIndex, direction) => {
  const startIndent = (lines[startIndex]?.match(/^\s*/u)?.[0].length ?? 0);
  const indices = direction === 'before'
    ? Array.from({ length: Math.min(30, startIndex) }, (_, offset) => startIndex - offset - 1)
    : Array.from({ length: Math.min(50, lines.length - startIndex - 1) }, (_, offset) => startIndex + offset + 1);
  for (const index of indices) {
    const line = lines[index];
    if (!line?.trim() || /^\s*\{\{/u.test(line)) continue;
    const match = /^\s*(?:-\s*)?["']?([A-Za-z0-9_.-]+)["']?:/u.exec(line)
      ?? (/^\s*-\s+\S/u.test(line) ? [line, '<YAML list item>'] : null);
    if (!match) continue;
    const indent = line.match(/^\s*/u)?.[0].length ?? 0;
    if (direction === 'before' && indent > startIndent) continue;
    return { index, name: match[1] };
  }
  return null;
};
const definedHelperAtLine = (lines, targetLine) => {
  const stack = [];
  for (let lineIndex = 0; lineIndex < targetLine; lineIndex += 1) {
    for (const action of lines[lineIndex].matchAll(/\{\{-?\s*([\s\S]*?)-?\}\}/gu)) {
      const expression = action[1].trim();
      const define = /^define\s+"([^"]+)"/u.exec(expression);
      if (define) stack.push({ kind: 'define', name: define[1] });
      else if (/^(?:if|with|range)\b/u.test(expression)) stack.push({ kind: 'control', name: null });
      else if (/^end\b/u.test(expression)) stack.pop();
    }
  }
  return [...stack].reverse().find((frame) => frame.kind === 'define')?.name ?? null;
};
const helperCallProof = (consumerPath, lines, consumerLine) => {
  const helper = definedHelperAtLine(lines, consumerLine);
  if (!helper) return [];
  const chartRoot = consumerPath.split('/templates/')[0];
  const directory = path.join(root, chartRoot, 'templates');
  const result = [];
  const visited = new Set();
  const callsFor = (name, chain) => {
    if (visited.has(name)) return;
    visited.add(name);
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    for (const entry of fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter((item) => item.isFile())) {
      const absolute = path.join(entry.parentPath, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
      const receiverLines = fs.readFileSync(absolute, 'utf8').split('\n');
      receiverLines.forEach((line, index) => {
        const call = new RegExp(`(?:include|template)\\s+"${escapedName}"\\s+(.+?)(?:\\s+\\||\\s*-?\\}\\})`, 'u').exec(line);
        if (!call) return;
        const argument = call[1].trim();
        const rootArgument = argument === '.' || argument === '$'
          || /^\(dict\b[\s\S]*?"root"\s+\$?(?:\s|\))/u.test(argument);
        if (!rootArgument) return;
        result.push(receiverEntry(relative, receiverLines, index + 1,
          `exact ${chain.length ? 'transitive ' : ''}call site for Helm helper ${name} with root-context argument ${argument}`));
        const owner = definedHelperAtLine(receiverLines, index + 1);
        if (owner && owner !== name) callsFor(owner, [...chain, name]);
      });
    }
  };
  callsFor(helper, []);
  return result;
};
const canonicalHelmPath = (value) => value.replace(/^\$\.?/u, '')
  .replace(/\["((?:\\.|[^"])*)"\]/gu, (_match, key) => `.${JSON.parse(`"${key}"`)}`)
  .replace(/\['((?:\\.|[^'])*)'\]/gu, (_match, key) => `.${key.replaceAll("\\'", "'").replaceAll('\\\\', '\\')}`)
  .replace(/^\./u, '')
  .replace(/\[[0-9]+\]/gu, '[]');
const balancedArgument = (text, start) => {
  let quote = null;
  let depth = 0;
  let index = start;
  for (; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(' || character === '[') { depth += 1; continue; }
    if (character === ')' || character === ']') {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (depth === 0 && (character === '|' || character === '}' || /\s/u.test(character))) break;
  }
  return text.slice(start, index).trim();
};
const argumentEnd = (text, start) => {
  const argument = balancedArgument(text, start);
  return start + argument.length;
};
const pipelineLeft = (text, pipeIndex) => {
  let depth = 0;
  let quote = null;
  for (let index = pipeIndex - 1; index >= 0; index -= 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === ')' || character === ']') { depth += 1; continue; }
    if (character === '(' || character === '[') {
      if (depth > 0) { depth -= 1; continue; }
      return text.slice(index + 1, pipeIndex).trim();
    }
    if (depth === 0 && (character === '|' || (character === '{' && text[index - 1] === '{'))) {
      return text.slice(index + 1, pipeIndex).replace(/^-?\s*/u, '').trim();
    }
  }
  return text.slice(0, pipeIndex).replace(/^.*?\{\{-?\s*/u, '').trim();
};
const defaultClauses = (expression) => {
  const result = [];
  for (const match of expression.matchAll(/\|\s*default\s+/gu)) {
    const start = (match.index ?? 0) + match[0].length;
    const fallback = balancedArgument(expression, start);
    const left = pipelineLeft(expression, match.index ?? 0);
    result.push({ left, fallback });
  }
  for (const match of expression.matchAll(/\bdefault\s+/gu)) {
    const before = expression.slice(0, match.index).trimEnd();
    if (before.endsWith('|')) continue;
    const fallbackStart = (match.index ?? 0) + match[0].length;
    const fallback = balancedArgument(expression, fallbackStart);
    let valueStart = argumentEnd(expression, fallbackStart);
    while (/\s/u.test(expression[valueStart] ?? '')) valueStart += 1;
    const left = balancedArgument(expression, valueStart);
    if (fallback && left) result.push({ left, fallback });
  }
  return result;
};
const templateEvidence = (consumer) => {
  const text = fs.readFileSync(path.join(root, consumer.path), 'utf8');
  const lines = text.split('\n');
  const sourceLine = lines[consumer.line - 1] ?? '';
  const start = Math.max(0, consumer.line - 4);
  const end = Math.min(lines.length, consumer.line + 3);
  const contextLines = lines.slice(start, end);
  const controlFrames = helmControlFrames(lines, consumer.line, sourceLine);
  const receiverMatch = sourceLine.match(/^\s*["']?([A-Za-z0-9_.-]+)["']?:/u);
  const assignment = /\{\{-?\s*(\$[A-Za-z_][A-Za-z0-9_]*)\s*:?=/u.exec(sourceLine)?.[1]
    ?? /\brange\s+(?:\$[A-Za-z_][A-Za-z0-9_]*\s*,\s*)?(\$[A-Za-z_][A-Za-z0-9_]*)\s*:=/u.exec(sourceLine)?.[1];
  let receiverProof = [];
  if (assignment) receiverProof = lines.map((line, index) => ({ text: line, index: index + 1 }))
    .filter((item) => item.index > consumer.line && item.text.includes(assignment))
    .map((item) => receiverEntry(consumer.path, lines, item.index, `downstream use of assigned Helm variable ${assignment}`));
  const currentControl = /\{\{-?\s*(?:else\s+if|if|with|range)\b/u.test(sourceLine) ? sourceLine.trim() : null;
  const directReceiver = /^\s*(?:-\s*)?["']?([A-Za-z0-9_.-]+)["']?:/u.exec(sourceLine)?.[1]
    ?? /^\s*([A-Z][A-Z0-9_]*)=/u.exec(sourceLine)?.[1]
    ?? /^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/u.exec(sourceLine)?.[1]
    ?? null;
  const priorReceiver = yamlReceiverAt(lines, consumer.line - 1, 'before');
  const followingReceiver = yamlReceiverAt(lines, consumer.line - 1, 'after');
  if (!receiverProof.length && directReceiver) receiverProof = [receiverEntry(consumer.path, lines, consumer.line, `exact rendered YAML field ${directReceiver}`)];
  if (!receiverProof.length && (assignment || currentControl || consumer.kind === 'helm-template-dynamic-index') && followingReceiver) {
    receiverProof = [receiverEntry(consumer.path, lines, followingReceiver.index + 1, assignment
      ? `first rendered YAML receiver after required assignment ${assignment}`
      : `first rendered YAML receiver in the controlled ${controlFrames.at(-1)?.kind ?? 'range'} branch`)];
  }
  if (!receiverProof.length && priorReceiver) receiverProof = [receiverEntry(consumer.path, lines, priorReceiver.index + 1, `scalar content of rendered YAML field ${priorReceiver.name}`)];
  if (consumer.exactValuePath) {
    assert.equal(canonicalHelmPath(consumer.fieldPath), canonicalHelmPath(consumer.exactValuePath),
      `LOCAL_HELM_LEAF_BINDING_MISMATCH: ${consumer.sourcePath}#${consumer.fieldPath} was claimed by ${consumer.path}:${consumer.line} as ${consumer.exactValuePath}`);
  }
  let helperProof = consumer.helperCallProof ? [(() => {
    const helperLines = fs.readFileSync(path.join(root, consumer.helperCallProof.path), 'utf8').split('\n');
    const actualLine = helperLines[consumer.helperCallProof.line - 1] ?? '';
    assert.equal(digest(actualLine), consumer.helperCallProof.sourceLineSha256,
      `LOCAL_HELM_HELPER_CALL_DRIFT: ${consumer.helperCallProof.path}:${consumer.helperCallProof.line}`);
    assert(new RegExp(`(?:include|template)\\s+"${consumer.helperCallProof.helper.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}"`, 'u').test(actualLine),
      `LOCAL_HELM_HELPER_CALL_MISMATCH: ${consumer.helperCallProof.path}:${consumer.helperCallProof.line}`);
    return receiverEntry(consumer.helperCallProof.path, helperLines, consumer.helperCallProof.line,
      `exact call site for Helm helper ${consumer.helperCallProof.helper} with .Values.${consumer.helperCallProof.argumentPath}`);
  })()] : helperCallProof(consumer.path, lines, consumer.line);
  if (helperProof.length) receiverProof.push(...helperProof);
  const insideDefinedHelper = /\{\{-?\s*define\s+"[^"]+"/u.test(lines.slice(0, consumer.line).join('\n'));
  if (insideDefinedHelper && helperProof.length === 0) throw new Error(`LOCAL_HELM_HELPER_CALL_PROOF_REQUIRED: ${consumer.path}:${consumer.line}`);
  if (!receiverProof.length) throw new Error(`LOCAL_HELM_RECEIVER_PROOF_REQUIRED: ${consumer.path}:${consumer.line} ${sourceLine.trim()}`);
  const defaults = defaultClauses(sourceLine);
  const currentPath = canonicalHelmPath(consumer.fieldPath);
  const pathIn = (expression) => [...expression.matchAll(/(?:\$[A-Za-z_][A-Za-z0-9_]*\.)?Values((?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])+)/gu)]
    .map((match) => canonicalHelmPath(match[1].replace(/^\./u, '')))
    .some((candidate) => currentPath === candidate);
  const matchingDefaults = defaults.flatMap((item) => {
    const roles = [];
    if (pathIn(item.left)) roles.push({ ...item, role: 'primary' });
    if (pathIn(item.fallback)) roles.push({ ...item, role: 'fallback' });
    return roles;
  });
  const selectedDefault = matchingDefaults.find((item) => item.role === 'primary') ?? matchingDefaults[0] ?? null;
  const defaultRole = selectedDefault?.role ?? null;
  const conditionProof = controlFrames.map((frame) => ({
    path: consumer.path,
    line: frame.branchLine,
    kind: frame.kind,
    branch: frame.branch,
    expression: frame.branchExpression,
    sourceLineSha256: digest(lines[frame.branchLine - 1] ?? ''),
  }));
  if (consumer.conditionalSignal && conditionProof.length === 0) conditionProof.push({
    path: consumer.path,
    line: consumer.line,
    kind: 'expression-selection',
    branch: 'inline',
    expression: sourceLine.trim().slice(0, 240),
    sourceLineSha256: digest(sourceLine),
  });
  const sourceKind = consumer.sourcePath?.startsWith?.('charts/') ? 'chart-default'
    : consumer.sourcePath?.startsWith?.('examples/') ? 'example-selected-value' : 'overlay-selected-value';
  return {
    path: consumer.path,
    line: consumer.line,
    kind: consumer.kind,
    templateExpression: consumer.templateExpression,
    sourceLineSha256: digest(sourceLine),
    contextSha256: digest(contextLines.join('\n')),
    receiver: receiverMatch?.[1] ? `rendered YAML field ${receiverMatch[1]}`
      : assignment ? `${assignment} Helm variable with ${receiverProof.length} exact downstream use(s)`
        : receiverProof.map((proof) => `${proof.path}:${proof.line} ${proof.relation}`).join('; '),
    receiverProof,
    conditionProof,
    condition: consumer.conditionalSignal
      ? (currentControl ?? (controlFrames.length ? controlFrames.map((frame) => `${frame.branch} ${frame.branchExpression}`).join(' and ') : 'the exact consumer expression performs conditional selection'))
      : 'unconditional in the linked template branch',
    exactValuePath: consumer.fieldPath.replace(/^\$\.?/u, ''),
    bindingKind: consumer.bindingKind ?? 'exact-leaf-access',
    bindingProof: consumer.bindingProof ?? 'exact leaf path occurs in the consumer expression',
    defaultProof: selectedDefault ? (defaultRole === 'fallback'
      ? `exact fallback ${selectedDefault.fallback} is selected only when ${selectedDefault.left} is Helm-empty`
      : `exact primary ${selectedDefault.left} falls back to ${selectedDefault.fallback} only when the primary is Helm-empty`)
      : consumer.requiredSignal ? 'the exact template expression requires a value and defines no fallback'
        : `no template fallback appears on the exact consumer line; the selected value comes from the digest-pinned ${sourceKind.replaceAll('-', ' ')}`,
    defaultClauseProof: selectedDefault ? {
      left: selectedDefault.left,
      fallback: selectedDefault.fallback,
      role: defaultRole,
      sourceLineSha256: digest(sourceLine),
    } : null,
    defaultClauseProofs: matchingDefaults.map((item) => ({
      left: item.left,
      fallback: item.fallback,
      role: item.role,
      sourceLineSha256: digest(sourceLine),
    })),
    defaultProofEvidence: {
      path: consumer.sourcePath,
      fieldPath: consumer.fieldPath,
      kind: sourceKind,
      sourceSha256: consumer.sourceSha256,
    },
  };
};

// This function can help a maintainer draft a contract, but the command never
// accepts its output. Every field must already have an explicit contract in
// the checked-in registry. This separation prevents a field-name heuristic
// from becoming published behavior merely because generation succeeded.
function unapprovedContractProposal(field) {
  const exactPath = field.path.replace(/^\$\.?/u, '');
  const p = cleanPath(field.path);
  const last = p.split('.').at(-1).replace(/\[[0-9]+\]/gu, '');
  const parent = context(field.path);
  const target = renderedTargets(field);
  const current = selected(field);
  const required = field.required === 'required';
  const conditional = field.required === 'conditional';
  const emptyByUse = required
    ? 'An empty or missing value stops Helm rendering through the linked required or fail guard.'
    : conditional
      ? 'An empty, false, or missing value omits or disables the linked rendered behavior, as shown by the exact template condition.'
      : 'An empty or missing value is passed to, or omitted from, the linked rendered field; use it only when the receiving API or process accepts that state.';
  const base = {
    group: 'typed-rendered-value',
    purpose: `Sets ${leaf(field.path)} for ${parent || chartRootFor(field.sourcePath)} in the rendered ${target} resources.`,
    acceptedValues: field.type === 'boolean' ? '`true` or `false`.'
      : field.type === 'integer' ? 'A safe base-10 integer accepted by the exact linked template and receiving API or process.'
        : 'A YAML string accepted by the exact linked template and receiving API or process.',
    emptyBehavior: emptyByUse,
    impact: `Changes the exact ${target} output linked in the consumer column when this source wins Helm precedence.`,
    failure: required ? 'A missing or rejected value stops Helm rendering. A type-valid but incompatible value fails API admission or the receiving workload.'
      : 'An invalid rendered value fails Helm or API acceptance. A type-valid but incompatible value makes the receiving workload degraded or unready.',
  };
  const set = (group, purpose, acceptedValues, emptyBehavior, impact, failure) => ({ group, purpose, acceptedValues, emptyBehavior, impact, failure });

  // Environment list entries are embedded Pod payloads. Their semantics come
  // from the exact named runtime input, not from the generic YAML leaf name.
  const environment = runtimeEnvironmentContract(field);
  if (environment && /(?:^|\.)(?:extra)?env\[[0-9]+\]\.name$/iu.test(exactPath)) {
    return set('environment-runtime-contract',
      `Binds the paired value to environment variable \`${environment.entry.name}\`. ${environment.contract.meaning}`,
      `A valid Kubernetes environment-variable name; this exact receiver requires \`${environment.entry.name}\`. The paired value accepts ${environment.contract.acceptedForm}`,
      `An empty name fails Kubernetes API validation. For the paired value: ${environment.contract.emptyBehavior}`,
      environment.contract.changeImpact,
      environment.contract.failureMeaning);
  }
  if (environment && /(?:^|\.)(?:extra)?env\[[0-9]+\]\.value$/iu.test(exactPath)) {
    return set('environment-runtime-contract',
      `Supplies \`${environment.entry.name}\` to its exact receiving process. ${environment.contract.meaning}`,
      environment.contract.acceptedForm,
      environment.contract.emptyBehavior,
      environment.contract.changeImpact,
      `${environment.contract.invalidBehavior} ${environment.contract.failureMeaning}`);
  }
  if (/(?:^|\.)(?:extra)?env\[[0-9]+\]\.valueFrom\.secretKeyRef\.name$/iu.test(exactPath)) return set('object-reference',
    `Selects the Kubernetes Secret object that supplies \`${environment?.entry.name ?? 'the paired environment variable'}\`.`,
    'A DNS-compatible Secret name in the same namespace as the rendered Pod.',
    'An empty or omitted name cannot resolve the required Secret reference.',
    `Changes which Secret supplies \`${environment?.entry.name ?? 'the paired environment variable'}\` without putting credential bytes in values.`,
    'A missing or malformed Secret name prevents Pod environment materialization and the container does not start.');
  if (/(?:^|\.)(?:extra)?env\[[0-9]+\]\.valueFrom\.secretKeyRef\.key$/iu.test(exactPath)) return set('secret-key-reference',
    `Selects the data key that supplies \`${environment?.entry.name ?? 'the paired environment variable'}\` from the named Secret.`,
    'A non-empty key present in the selected Kubernetes Secret.',
    'An empty or omitted key cannot select the required Secret value.',
    `Changes which credential or protected value reaches \`${environment?.entry.name ?? 'the paired environment variable'}\`.`,
    'A missing key prevents Pod environment materialization and the container does not start.');

  if (/(?:^|\.)resources(?:\.[^.]+)?\.(requests|limits)\.(cpu|memory|ephemeral-storage)$/u.test(p)) {
    const [, boundary, resource] = p.match(/(?:^|\.)resources(?:\.[^.]+)?\.(requests|limits)\.(cpu|memory|ephemeral-storage)$/u);
    const kind = resource === 'cpu' ? 'CPU' : resource === 'memory' ? 'memory' : 'ephemeral-storage';
    return set(`resource-${boundary}-${resource}`, `Sets the ${kind} ${boundary.slice(0, -1)} for ${parent.replace(/ \/ resources \/ (requests|limits)$/u, '')}.`, `A positive Kubernetes ${kind} quantity, such as ${resource === 'cpu' ? '`250m` or `2`' : '`256Mi` or `2Gi`'}.`, 'An empty scalar is invalid. Removing the field omits that resource boundary from the rendered container.', `Changes scheduling, isolation, and ${boundary === 'requests' ? 'reserved capacity' : 'the enforcement ceiling'} for the linked container.`, `An invalid quantity fails API admission. An excessive request leaves the Pod Pending; an undersized ${boundary.slice(0, -1)} causes contention, throttling, eviction, or termination.`);
  }
  if (last === 'allowPrivilegeEscalation') return set('privilege-escalation-control', `Controls whether the process in ${parent} can gain more Linux privileges than its parent.`, '`false` prevents privilege escalation. `true` permits it when the runtime and other security controls allow it.', 'Removing the field delegates to Kubernetes and runtime defaults; an empty scalar is invalid.', 'Changes the no-new-privileges boundary for the container process.', 'A non-Boolean value fails admission. Enabling it weakens isolation; disabling it can break software that requires setuid or file capabilities.');
  if (last === 'privileged') return set('privileged-container-control', `Controls privileged execution for ${parent}.`, '`false` keeps the normal container isolation boundary. `true` grants broad host-level device and kernel access.', 'Removing the field uses the Kubernetes default `false`; an empty scalar is invalid.', 'Changes the container from restricted isolation to broad host authority.', 'A non-Boolean value fails admission. Enabling it can bypass isolation; disabling it breaks workloads that incorrectly depend on host authority.');
  if (last === 'runAsNonRoot') return set('non-root-enforcement', `Requires Kubernetes to verify a non-root user for ${parent}.`, '`true` rejects an image or user selection that resolves to UID 0. `false` removes this check.', 'Removing the field delegates to the Pod-level context or runtime default; an empty scalar is invalid.', 'Changes startup enforcement of the non-root identity boundary.', 'A non-Boolean value fails admission. `true` with a root image prevents startup; `false` can permit unintended root execution.');
  if (last === 'runAsRoot') return set('root-mode-control', `Controls whether the chart selects its explicit root-execution path for ${parent || chartRootFor(field.sourcePath)}.`, '`true` selects the chart root path. `false` selects the non-root path.', 'An empty scalar is invalid; removing the field uses the chart default.', 'Changes user identity, writable paths, and the security context rendered for the workload.', 'A non-Boolean value stops rendering. Root mode weakens isolation; non-root mode fails if the image or mounted paths require root.');
  if (last === 'readOnlyRootFilesystem') return set('read-only-root-filesystem', `Controls whether ${parent} can write to the container image filesystem.`, '`true` makes the image root filesystem read-only. `false` permits writes.', 'Removing the field uses the Kubernetes default `false`; an empty scalar is invalid.', 'Changes whether runtime writes must use explicit writable volumes.', 'A non-Boolean value fails admission. Enabling it without writable mounts causes application errors; disabling it weakens immutability.');
  if (last === 'readOnly') return set('read-only-volume-mount', `Controls whether ${parent} can write through this volume mount.`, '`true` mounts the selected volume read-only. `false` permits writes subject to the volume and filesystem.', 'Removing the field uses the Kubernetes default `false`; an empty scalar is invalid.', 'Changes whether this container can modify the mounted data.', 'A non-Boolean value fails admission. Read-only mode breaks required writes; writable mode can expose shared or credential data to modification.');
  if (last === 'automount') return set('service-account-token-automount', `Controls automatic ServiceAccount token mounting for ${parent}.`, '`true` injects the default API token volume. `false` omits it unless another explicit projected token is configured.', 'Removing the value delegates to the ServiceAccount or Pod default; an empty scalar is invalid.', 'Changes whether the workload receives ambient Kubernetes API credentials.', 'A non-Boolean value fails admission. Disabling it breaks clients that rely on ambient tokens; enabling it adds credentials that the process might not need.');
  if (last === 'create') return set('service-account-creation', `Controls whether the chart creates the ServiceAccount for ${parent}.`, '`true` renders a ServiceAccount. `false` requires the configured existing account to be present.', 'An empty scalar is invalid; removing the field uses the chart default.', 'Changes ownership of the workload identity object between this release and the cluster operator.', 'A non-Boolean value stops rendering. Disabling creation without a valid existing account prevents Pod startup.');
  if (last === 'overrideOnRestart') return set('restart-content-overwrite', `Controls whether startup replaces existing ${parent} content with the checked-in chart content.`, '`true` overwrites the managed file during restart. `false` preserves existing persisted content.', 'An empty scalar is invalid; removing the field uses the chart default.', 'Changes whether operator or runtime edits survive the next Pod restart.', 'A non-Boolean value stops rendering. Enabling it can discard local edits; disabling it can retain stale or incompatible content.');
  if (last === 'bridgeEnabled') return set('service-bridge-control', `Controls whether the Service exposes the additional bridge route for ${parent}.`, '`true` renders the bridge port and route. `false` omits them.', emptyByUse, 'Changes whether bridge traffic can reach the workload through the Kubernetes Service.', 'A non-Boolean value stops rendering. Enabling it without a matching listener creates a dead route; disabling it makes bridge clients fail.');
  if (last === 'cilium') return set('cilium-policy-mode', `Controls whether ${parent} uses Cilium-specific policy features.`, '`true` selects the Cilium policy branch. `false` keeps the portable Kubernetes NetworkPolicy branch.', emptyByUse, 'Changes the policy API and features used to enforce network isolation.', 'A non-Boolean value stops rendering. Enabling it without Cilium leaves policy resources unsupported; disabling it removes Cilium-only enforcement.');
  if (last === 'enabled') return set('feature-enable-control', `Controls whether ${parent || chartRootFor(field.sourcePath)} is active and rendered.`, '`true` enables the named feature. `false` disables or omits its linked resources and process settings.', emptyByUse, `Changes whether the exact ${target} feature branch and its resources are present.`, 'A non-Boolean value stops rendering or API processing. Disabling a required dependency makes its consumers unready; enabling it without prerequisites makes startup or reconciliation fail.');
  if (last === 'replicas' || last === 'replicaCount') return set('replica-count', `Sets the desired replica count for ${parent || chartRootFor(field.sourcePath)}.`, 'A non-negative integer. Zero stops all replicas for components whose template permits zero.', 'An empty scalar is invalid. Removing the override uses the chart default.', 'Changes availability, scheduling demand, rollout behavior, and resource consumption.', 'A negative or fractional value fails rendering or admission. Too few replicas reduce availability; too many can remain Pending.');
  if (last === 'repository' && field.sourcePath === 'charts/gitops/values.yaml') return set('gitops-root-selection', 'Selects the Git repository reconciled by the generated root Argo CD Application.', 'An absolute Git repository URL supported by Argo CD and authorized through its repository credentials.', 'An empty value fails the required chart guard and cannot create a usable source.', 'Changes the complete desired-state source read by the root platform Application.', 'A malformed, unavailable, or unauthorized repository makes Argo CD comparison and synchronization fail.');
  if (last === 'repository') return set('image-repository', `Selects the OCI image repository for ${parent}.`, 'A repository path without a tag, digest, URL scheme, or embedded credential.', 'An empty repository cannot identify the selected image unless another exact chart source supplies it.', 'Changes the registry namespace from which nodes pull executable content.', 'A malformed or unavailable repository causes image-reference rejection or ImagePullBackOff.');
  if (last === 'tag') return set('image-tag', `Selects the display tag for ${parent}; an accompanying digest remains the immutable content authority.`, 'A valid OCI image tag without `@sha256:`.', 'An empty tag delegates selection to the linked chart logic and is not an immutable release choice.', 'Changes the tag portion of the image reference.', 'A malformed or unavailable tag fails image parsing or pull; a mutable tag can select different content later.');
  if (last === 'digest') return set('oci-image-digest', `Pins the immutable OCI image identity for ${parent}.`, 'Either an empty value when image pinning is deliberately supplied later, or `sha256:` followed by 64 lower-case hexadecimal characters.', 'An empty value removes immutable image selection and is accepted only where release materialization or another explicit image authority supplies it.', 'Changes the exact container image bytes executed by the workload.', 'Malformed input stops image-reference validation. A valid but unavailable digest causes ImagePullBackOff.');
  if (last === 'policyDigest' || last === 'sha256') return set('raw-sha256-digest', `Pins the immutable SHA-256 identity for ${parent}.`, 'Either an empty value on the explicitly inactive path, or exactly 64 lower-case hexadecimal characters without a `sha256:` prefix.', 'An empty value removes immutable identity proof and is accepted only on the explicitly inactive or later-materialized path.', 'Changes the exact code bundle or native worker policy bytes accepted by the workload.', 'Malformed input stops policy validation or makes `sha256sum` verification fail before the selected content is used.');
  if (last === 'pullPolicy' || last === 'imagePullPolicy') return set('image-pull-policy', `Selects when Kubernetes pulls the image for ${parent}.`, '`Always`, `IfNotPresent`, or `Never`.', 'An empty or omitted value lets Kubernetes derive policy from the image reference, which can differ from this explicit baseline.', 'Changes registry traffic and whether a cached image can be reused.', 'An unsupported value fails API admission. `Never` without a cached image or an unreachable required pull leaves the Pod unready.');
  if (/secret(Name)?$/iu.test(last) || ['existingSecret', 'authSecret', 'bearerSecret', 'githubSecret', 'signingSecretName', 'caSecretName', 'tlsSecretName', 'claimName'].includes(last)) return set('object-reference', `Selects the existing Kubernetes ${last === 'claimName' ? 'PersistentVolumeClaim' : 'Secret'} used by ${parent || chartRootFor(field.sourcePath)}.`, 'A DNS-compatible object name in the release namespace.', 'An empty value disables this reference only where the linked template has an explicit optional branch; otherwise rendering or Pod startup fails.', `Changes which existing object supplies data or storage to the linked ${target} resource.`, 'A malformed name fails admission. A missing object prevents Pod startup, credential loading, or volume attachment.');
  if (last === 'key' && p.includes('configMap.items')) return set('configmap-key-reference', `Selects the ConfigMap data key projected for ${parent}.`, 'A non-empty key present in the named ConfigMap data or binaryData map.', 'An empty key cannot select projected data.', 'Changes which ConfigMap value appears at the paired projected file path.', 'A missing key prevents projected-volume setup unless the source item is explicitly optional.');
  if (/SecretKey$|^key$|^secretKey$|^passwordKey$|^usernameKey$|^caSecretKey$|^signingSecretKey$|^controllerCaSecretKey$/u.test(last)) return set('secret-key-reference', `Selects the data key inside the configured Secret for ${parent}.`, 'A non-empty Kubernetes Secret data-key string.', 'An empty key cannot select the required value and is accepted only when the complete Secret integration is disabled.', 'Changes which value from the named Secret reaches the linked workload.', 'A missing key prevents environment or volume materialization and leaves the workload unready.');
  if (last === 'port' || /Port$/u.test(last) || last === 'containerPort' || last === 'targetPort' || last === 'proxyPort') return set('network-port', `Sets the TCP or UDP port used by ${parent}.`, 'An integer from 1 through 65535, or zero only where the linked Service template explicitly uses zero as automatic/not-selected.', 'An empty scalar is invalid for a rendered numeric port. Removing an optional override returns to the chart default.', 'Changes the listener, Service route, proxy route, or health-check destination linked by the templates.', 'An out-of-range or conflicting port fails admission or startup. A mismatch makes health checks and client connections fail.');
  if (last === 'protocol') return set('network-protocol', `Selects the Kubernetes network protocol for ${parent}.`, '`TCP`, `UDP`, or `SCTP`, subject to cluster support.', 'An omitted Service port protocol defaults to `TCP`; an empty scalar is invalid.', 'Changes how the Service or container port is interpreted and routed.', 'An unsupported protocol fails admission; a mismatch prevents traffic from reaching the process.');
  if (last === 'repoUrl') return set('git-repository-url', `Selects the Git repository cloned by ${parent}.`, 'An absolute HTTPS or SSH Git URL supported by the checked-in clone client and its configured credentials.', 'An empty value leaves the enabled checkout without a source repository.', 'Changes the complete source history and working tree supplied to the agent.', 'A malformed, unavailable, or unauthorized repository makes clone or fetch fail and prevents workspace initialization.');
  if (last === 'archiveUrl') return set('code-archive-url', `Selects the immutable code-bundle archive downloaded by ${parent}.`, 'An absolute HTTP or HTTPS URL reachable by the init container; its bytes must match the adjacent SHA-256 authority.', 'An empty value leaves the enabled code-bundle path without downloadable content.', 'Changes the location from which the pinned runtime code bundle is retrieved.', 'A malformed or unreachable URL stops initialization; bytes from the wrong object fail SHA-256 verification.');
  if (last === 'endpoints') return set('registry-probe-endpoint', `Adds one registry endpoint checked by ${parent}.`, 'An absolute registry base URL with `http` or `https` matching the authorized registry transport.', 'An empty item is invalid; an empty list means that this dependency probe checks no registry.', 'Changes which registry must answer before the dependency check succeeds.', 'A malformed, unreachable, or TLS-invalid endpoint keeps the dependency probe unready.');
  if (last === 'endpoint' || last === 'url' || last === 'controllerUrl') return set('service-endpoint-url', `Selects the service endpoint contacted by ${parent}.`, 'An absolute URL with a scheme implemented by the exact receiving client and a host reachable from the workload.', 'An empty value disables the integration only where its linked enable control permits it; otherwise the client has no destination.', 'Changes the service instance and trust boundary contacted by the workload.', 'A malformed URL stops configuration. An unreachable, unauthorized, or TLS-invalid endpoint makes the integration fail.');
  if (last === 'host' || last === 'hostname') return set('host-name', `Selects the network host identity used by ${parent}.`, 'A non-empty DNS-compatible host name accepted by the linked client or Tailscale controller.', 'An empty value removes the explicit host identity and is accepted only on a disabled integration path.', 'Changes service discovery, the advertised Tailnet name, or the destination contacted by the workload.', 'A malformed or unresolved name causes admission, registration, or connection failure.');
  if (last === 'storageClass') return set('storage-class', `Selects the Kubernetes StorageClass for ${parent}.`, 'An empty string to use the cluster default, or a DNS-compatible existing StorageClass name.', 'Empty explicitly selects the cluster default. It is not proof that a default class exists.', 'Changes the provisioner, topology, expansion, reclaim, and performance behavior of new claims.', 'A missing or unsuitable class leaves the PVC Pending. Changing it does not migrate an existing volume.');
  if (last === 'size' || last === 'storage') return set('storage-capacity', `Requests persistent storage capacity for ${parent}.`, 'A positive Kubernetes storage quantity such as `20Gi`.', 'An empty scalar is invalid for an enabled claim; removing the override uses the chart default where one exists.', 'Changes requested PVC capacity. Existing volumes do not shrink when this value decreases.', 'An invalid or unsupported size fails provisioning; insufficient capacity causes application write failures.');
  if (last === 'accessModes') return set('pvc-access-mode', `Selects a Kubernetes PVC access mode for ${parent}.`, '`ReadWriteOnce`, `ReadWriteOncePod`, `ReadOnlyMany`, or `ReadWriteMany`, subject to provisioner support.', 'An empty item is invalid; an enabled claim requires at least one supported access mode.', 'Changes how many nodes or Pods may mount the volume and the safety boundary for concurrent writers.', 'An unsupported mode leaves the PVC Pending; a mode broader than intended can permit unsafe concurrent access.');
  if (last === 'initialDelaySeconds') return set('probe-initial-delay', `Sets the delay before Kubernetes starts the ${parent} health probe.`, 'An integer number of seconds greater than or equal to 0.', 'Removing the field uses the Kubernetes default of 0 seconds; an empty scalar is invalid.', 'Changes how long the container can initialize before probe results affect its state.', 'A short delay can mark a healthy but slow-starting process failed; a long delay hides an early failure.');
  if (last === 'periodSeconds') return set('probe-period', `Sets the interval between Kubernetes ${parent} health probes.`, 'An integer number of seconds greater than or equal to 1.', 'Removing the field uses the Kubernetes default of 10 seconds; an empty scalar is invalid.', 'Changes detection latency and the request load created by health checks.', 'A short period adds load and amplifies transient errors; a long period delays readiness and failure detection.');
  if (last === 'timeoutSeconds') return set('probe-timeout', `Sets how long Kubernetes waits for each ${parent} health probe result.`, 'An integer number of seconds greater than or equal to 1.', 'Removing the field uses the Kubernetes default of 1 second; an empty scalar is invalid.', 'Changes how much response latency the probe accepts before it records a failure.', 'A short timeout rejects a slow healthy process; a long timeout delays failure detection and restart.');
  if (last === 'failureThreshold') return set('probe-failure-threshold', `Sets how many consecutive failed ${parent} health probes Kubernetes accepts before it changes container state.`, 'An integer greater than or equal to 1.', 'Removing the field uses the Kubernetes default of 3; an empty scalar is invalid.', 'Changes the balance between fast failure response and tolerance of transient errors.', 'A low threshold causes false restarts or unready states; a high threshold leaves a failed process active longer.');
  if (last === 'tokenExpirationSeconds' && p.includes('productDecisions')) return set('product-decision-token-expiry', `Requests the lifetime of the projected ServiceAccount token used by ${parent}.`, 'An integer from 600 through 3600 seconds, as enforced by the Prism values schema.', 'The schema requires this field. Removing it or supplying an empty scalar fails Helm schema validation.', 'Changes token rotation frequency and the maximum requested lifetime of the credential sent to the product-decision controller.', 'A value outside 600 through 3600 fails schema validation. A longer lifetime retains a stolen token longer; a shorter lifetime increases rotation pressure.');
  if (last === 'expirationSeconds' && /serviceAccountToken/iu.test(p)) return set('projected-token-expiry', `Requests the lifetime of the projected ServiceAccount token used by ${parent}.`, 'An integer number of seconds of at least 600; the API server can issue a token with a different effective lifetime under its configured policy.', 'Removing the field uses the Kubernetes projected-token default of 3600 seconds; an empty scalar is invalid.', 'Changes token rotation frequency and the maximum requested credential lifetime.', 'A value below 600 fails admission. A lifetime that is too short increases rotation pressure; one that is too long retains a stolen token longer.');
  if (/TtlMs$|TtlSeconds$|ExpirationSeconds$/iu.test(last)) return set('expiry-duration', `Sets how long ${parent} remains valid before it expires.`, 'A positive safe integer in the unit named by the field.', 'An empty, zero, negative, or fractional value is invalid for this enabled expiry path.', 'Changes how long leases, quarantine entries, or credentials remain usable before renewal or removal.', 'A value that is too short causes churn or premature rejection; a value that is too long retains stale authority or data.');
  if (/IntervalMs$/u.test(last)) return set('poll-interval', `Sets the delay between repeated ${parent} checks.`, 'A positive safe integer in milliseconds.', 'An empty, zero, negative, or fractional value is invalid while polling is enabled.', 'Changes detection latency and the request or CPU load created by polling.', 'A value that is too short overloads the service; a value that is too long delays state changes and recovery.');
  if (last === 'preStopDrainSeconds') return set('pre-stop-drain-duration', `Sets how long ${parent} waits for in-flight work to drain before container exit.`, 'A non-negative integer number of seconds shorter than the termination grace period.', 'An empty scalar is invalid; zero skips the explicit drain wait.', 'Changes the time available to stop accepting work and finish current operations.', 'Too little time interrupts work; too much time consumes the termination window and forces Kubernetes to kill the process.');
  if (last === 'terminationGracePeriodSeconds') return set('termination-grace-duration', `Sets the Kubernetes termination grace period for ${parent}.`, 'A non-negative integer number of seconds long enough for the linked drain and shutdown operations.', 'Removing the field uses the Kubernetes default; an empty scalar is invalid.', 'Changes the total time Kubernetes permits between termination request and forced kill.', 'A short period loses in-flight work; a long period delays rollout, scale-down, and node drain.');
  if (last === 'maximumDurationSeconds') return set('backup-duration-limit', `Sets the maximum permitted runtime for ${parent}.`, 'A positive integer number of seconds that fits inside the CronJob and storage operating window.', 'An empty, zero, negative, or fractional value fails backup policy validation.', 'Changes when a slow backup is treated as failed and terminated.', 'A short limit aborts valid backups; an excessive limit allows stuck jobs to overlap or consume resources.');
  if (/TimeoutMs$/u.test(last)) return set('shutdown-timeout', `Sets the maximum wait for ${parent} to finish during shutdown.`, 'A non-negative safe integer in milliseconds; enabled graceful shutdown requires a positive value.', 'An empty, negative, or fractional value is invalid; zero permits no graceful wait.', 'Changes how long the process waits for the selected worker or resource to close.', 'A short timeout interrupts work or cleanup; an excessive timeout consumes the Kubernetes termination window.');
  if (last === 'schedule' || /Schedule$/u.test(last)) return set('cron-schedule', `Sets the CronJob schedule for ${parent}.`, 'A valid five-field Kubernetes cron expression.', 'An empty schedule is invalid for an enabled CronJob.', 'Changes when backup or verification work starts and therefore changes recovery-point timing and load.', 'An invalid expression fails API admission; an unsafe interval misses recovery objectives or overlaps jobs.');
  if (last === 'namespace' || /Namespace$/u.test(last) || last === 'namespaces' || last === 'execNamespaces') return set('namespace-name', `Selects the Kubernetes namespace scope used by ${parent}.`, 'A DNS-label namespace name that exists or is deliberately created by the platform.', 'An empty item is invalid. An empty optional list removes that namespace grant or scheduling scope.', 'Changes placement, RBAC scope, identity matching, or the namespace contacted by the linked component.', 'A malformed or absent namespace causes admission, scheduling, identity, or authorization failure.');
  if (/ServiceAccount$/u.test(last)) return set('service-account-name', `Selects the Kubernetes ServiceAccount identity used by ${parent}.`, 'A DNS-label ServiceAccount name in the configured namespace.', 'An empty value is accepted only when the complete identity integration is disabled.', 'Changes the workload or token identity trusted by the receiving controller.', 'A missing account prevents Pod or projected-token creation; a wrong account fails authorization or trust checks.');
  if (last === 'command') return set('process-command', `Defines one ordered process command argument for ${parent}.`, 'A non-empty string accepted by the selected container image; array order is significant.', 'An empty item is passed literally and normally makes process startup fail.', 'Changes the executable or ordered argument vector started in the linked container.', 'A wrong executable, flag, or order makes the container exit or start an unintended mode.');
  if (last === 'name' && /env/iu.test(p)) return set('environment-name-unresolved', `Names an environment variable at this exact position for ${parent}, but no paired named runtime contract was found.`, 'A valid Kubernetes environment-variable name understood by the selected process.', 'An empty or malformed name fails API admission.', 'Can bind a value to a different process setting.', 'A wrong but valid name is ignored by the process and can silently leave default behavior active.');
  if (last === 'value' && /env/iu.test(p)) return set('environment-value-unresolved', `Supplies a process environment value at this exact position for ${parent}, but no paired named runtime contract was found.`, 'A string accepted by the exact receiving process.', 'An empty value is delivered as an empty string and is not equivalent to an omitted variable.', 'Changes the selected process behavior without changing the Pod API shape.', 'An invalid value is rejected by the receiving process or produces degraded runtime behavior.');
  if (last === 'mountPath') return set('volume-mount-path', `Selects the absolute container mount path for ${parent}.`, 'An absolute POSIX path inside the container filesystem.', 'An empty or relative mount path is invalid for a rendered volumeMount.', 'Changes where the process reads or writes the mounted data.', 'A duplicate, relative, or inaccessible path prevents Pod creation or makes the process unable to find its data.');
  if (last === 'subPath') return set('volume-subpath', `Selects the file or directory below the volume root mounted at ${parent}.`, 'A clean relative path inside the volume without `..` traversal.', 'An empty value mounts the volume root instead of one child path.', 'Restricts the mount to one file or subdirectory without changing its container mount path.', 'A missing or unsafe subpath prevents volume setup and leaves the Pod unready.');
  if (last === 'path' && /(?:liveness|readiness|startup)Probe\.httpGet/iu.test(p)) return set('http-probe-path', `Selects the HTTP request path used by the ${parent} health probe.`, 'An absolute HTTP path that starts with `/` and is served by the selected probe port.', 'An empty or relative path is invalid for this explicit HTTP probe.', 'Changes the endpoint Kubernetes calls before it routes traffic or restarts the container.', 'A wrong path returns an error or times out, so the Pod stays unready or enters a restart loop.');
  if (last === 'runAsUser') return set('run-as-user', `Sets the numeric Linux user ID for ${parent}.`, 'A non-negative integer user ID available to the selected image; non-root policy requires a value other than `0`.', 'Removing the field delegates the user ID to the image or Pod-level security context; an empty scalar is invalid.', 'Changes filesystem access and the operating-system identity of the container process.', 'An unavailable ID causes permission errors; ID `0` violates non-root policy and weakens isolation.');
  if (last === 'runAsGroup') return set('run-as-group', `Sets the primary numeric Linux group ID for ${parent}.`, 'A non-negative integer group ID compatible with the mounted files and selected image.', 'Removing the field delegates the primary group to the image or Pod-level security context; an empty scalar is invalid.', 'Changes group-based filesystem access for the container process.', 'A mismatched group causes permission errors; an over-privileged group can expose data to the process.');
  if (last === 'defaultMode') return set('projected-file-mode', `Sets the default Unix permission bits for files projected by ${parent}.`, 'An integer from 0 through 511 (octal `0000` through `0777`); YAML decimal notation is converted by Kubernetes.', 'Removing the field uses Kubernetes default mode `0644`; an empty scalar is invalid.', 'Changes who can read or write each projected file unless an item supplies its own mode.', 'An out-of-range value fails admission; an unsafe mode exposes credentials, while a restrictive mode prevents the process from reading them.');
  if (last === 'add' || last === 'drop') return set('linux-capability', `${last === 'add' ? 'Adds' : 'Drops'} one Linux capability for ${parent}.`, 'A Linux capability name supported by the container runtime, normally upper-case such as `NET_ADMIN`.', 'An empty list item is invalid. An empty list adds or drops no capability.', 'Changes the kernel operations available to the container process.', 'An unsupported name fails admission or startup; excess capabilities weaken isolation; missing capabilities break the selected operation.');
  if (last === 'type' && p.includes('securityContext')) return set('security-profile-type', `Selects the container security profile type for ${parent}.`, 'A Kubernetes-supported profile type such as `RuntimeDefault`, `Localhost`, or `Unconfined`, subject to the specific profile field.', 'An omitted type delegates profile selection to cluster defaults; an empty scalar is invalid.', 'Changes syscall or application confinement for the container.', 'An unsupported profile fails admission or startup; an unconfined profile weakens isolation.');
  if (last === 'model' || last === 'primary' || last === 'fallbacks') return set('model-selection', `Selects an ordered model identifier for ${parent}.`, 'A non-empty provider-qualified model identifier installed and authorized in the active model gateway.', 'An empty primary or list item is invalid; an empty fallback list means no fallback model is attempted.', 'Changes model behavior, cost, latency, provider credentials, and fallback order.', 'An unknown or unauthorized model causes request failure; a missing fallback leaves primary failures unrecovered.');
  if (last === 'scheme' && /Probe\.httpGet/iu.test(p)) return set('http-probe-scheme', `Selects the transport used by the ${parent} health probe.`, 'Exactly `HTTP` or `HTTPS`.', 'Removing the explicit scheme makes Kubernetes use `HTTP`; an empty scalar is invalid.', 'Changes whether kubelet uses clear-text HTTP or TLS for this health request.', 'An unsupported scheme fails admission; a scheme that does not match the listener makes the probe fail.');
  if (last === 'scheme') return set('capability-route-scheme', `Selects the URL scheme used by the ${parent} capability route.`, 'Exactly a scheme implemented by the capability client and provider; the current route uses `http` or `https`.', 'An empty value leaves the client unable to construct the route while the provider is enabled.', 'Changes the transport and TLS boundary used for capability dispatch.', 'An unsupported or mismatched scheme makes dispatch fail before the provider receives the request.');
  if (last === 'adapter') return set('capability-adapter', `Selects the dispatch adapter that interprets ${parent}.`, 'Exactly an adapter identifier implemented by the Nova capability client, such as the checked-in `openclaw`, `buster-plan-v1`, or `runtime` adapters.', 'An empty value leaves the enabled capability without dispatch logic.', 'Changes request encoding, route selection, and response handling for the capability.', 'An unknown adapter stops configuration validation or makes capability dispatch fail.');
  if (last === 'authentication') return set('capability-authentication', `Selects the authentication method used by ${parent}.`, 'Exactly an authentication identifier implemented by both capability peers; the checked-in runtime route uses `spiffe-proxy`.', 'An empty value removes the declared trust method and is accepted only while the provider is disabled.', 'Changes how Nova proves its identity to the capability provider.', 'An unsupported or mismatched method rejects dispatch or bypasses the intended identity proxy.');
  if (last === 'modes') return set('namespace-access-mode', `Grants one namespace-lease access mode to the subject in ${parent}.`, 'Exactly `deployer` or `tester`, as implemented by the namespace controller.', 'An empty item is invalid; an empty modes list grants this subject no lease access.', 'Changes which deployment or test operations the paired subject may perform in a leased namespace.', 'An unknown mode is rejected or never matches. An excessive mode grants the subject more authority than intended.');
  if (last === 'allowedPrefixes') return set('namespace-prefix-allowlist', `Adds one namespace-name prefix accepted by ${parent}.`, 'A non-empty DNS-label prefix; the admission policy matches it followed by `-`.', 'An empty item is invalid; an empty list denies namespace names through this allow-list.', 'Changes which namespace name families the broker and admission policy can create or manage.', 'A malformed prefix never matches or fails CRD validation; a broad prefix expands the broker boundary.');
  if (last === 'allowedSourceSecrets') return set('source-secret-allowlist', `Adds one release-namespace Secret that ${parent} may copy into a leased test namespace.`, 'A DNS-compatible Secret name in the release namespace that contains test-safe data.', 'An empty item is invalid; an empty list permits no source Secret copy.', 'Changes the credential or fixture material that the namespace controller may replicate.', 'A missing name makes copy fail; adding a production credential leaks authority into test namespaces.');
  if (/ownerAllowFrom/iu.test(last)) return set('owner-command-identity', `Adds one operator identity authorized for owner-only commands in ${parent}.`, 'A channel-qualified OpenClaw sender ID such as `discord:<snowflake>`.', 'An empty item is invalid; an empty list grants no identity through this owner-command list.', 'Changes who can invoke commands reserved for the OpenClaw owner.', 'A malformed identity never matches; the wrong identity denies the operator or grants owner authority to another sender.');
  if (/allowFromDiscord/iu.test(last)) return set('discord-command-identity', `Adds one Discord sender allowed by ${parent}.`, 'A Discord user snowflake in bare, `user:`, or `discord:` form, as accepted by the gateway renderer.', 'An empty item is invalid; an empty list denies Discord senders through this list.', 'Changes who can use Discord direct messages, commands, and configured guild channels.', 'A malformed identity never matches; the wrong snowflake denies the intended user or authorizes another account.');
  if (/Approvers/iu.test(last)) return set('execution-approver-identity', `Adds one Discord identity allowed to approve execution requests in ${parent}.`, 'A channel-qualified Discord user identity in the form accepted by the approval plugin, such as `user:<snowflake>`.', 'An empty item is invalid; an empty list provides no approver through this setting.', 'Changes who can approve protected execution requests.', 'A malformed identity never matches; the wrong identity blocks approvals or grants approval authority to another user.');
  if (last === 'image' || last === 'codexImage' || last === 'mcpImage') return set('complete-image-reference', `Selects the complete container image for ${parent || chartRootFor(field.sourcePath)}.`, 'A valid OCI image reference; production release paths require an immutable `@sha256:` digest.', 'An empty value is accepted only when a later release-materialization or explicit override supplies the image.', 'Changes the exact executable container content started by Kubernetes.', 'A malformed or unavailable reference fails rendering, policy validation, or image pull and leaves the Pod unready.');
  if (last === 'agentRole') return set('agent-role', `Selects the KubeClaw runtime role for ${parent || 'this release'}.`, 'Exactly one of `nova`, `forge`, `echo`, `buster`, or `prism` for the primary role; capability-provider entries must name an installed role accepted by the same chart helper.', 'An empty or unknown role fails the linked chart guards and cannot select role-specific containers or policy.', 'Changes enabled runtime containers, configuration, RBAC, probes, and capability routing for the release.', 'An unsupported role stops rendering or starts a release without the required role-specific behavior.');
  if (last === 'project' && p.startsWith('agent.')) return set('project-identity', 'Selects the project identifier passed to the agent runtime.', 'A non-empty project identifier accepted by the runtime and matching the intended repository/workspace scope.', 'An empty value leaves the runtime without the selected project identity unless its exact startup path documents a fallback.', 'Changes project-scoped state, logs, artifacts, and dispatch context.', 'A missing or wrong project routes work to the wrong scope or makes runtime validation fail.');
  if (['project', 'revision', 'rootName'].includes(last) && field.sourcePath === 'charts/gitops/values.yaml') return set('gitops-root-selection', `Selects the Argo CD ${leaf(field.path)} for the generated root Application.`, last === 'revision' ? 'A Git revision resolvable by the configured repository.' : 'A non-empty Argo CD project or DNS-compatible Application name, as applicable.', 'An empty value fails the required chart guard.', 'Changes which root Application, Argo project, or Git content revision owns platform reconciliation.', 'An invalid name fails admission; an unavailable revision or project makes Argo CD comparison and synchronization fail.');
  if (['token', 'apiKey'].includes(last)) return set('inline-secret-value', `Supplies the inline credential for ${parent}.`, 'A non-empty token accepted by the receiving service; prefer the adjacent existing-Secret interface.', 'An empty value selects the existing-Secret path where configured; otherwise authentication is unavailable.', 'Changes the credential used by the rendered workload and can expose sensitive material in rendered output.', 'A missing or rejected credential causes authentication failure; storing it inline increases disclosure risk.');
  if (['audience', 'tokenAudience'].includes(last)) return set('token-audience', `Sets the token audience required by ${parent}.`, 'A non-empty audience string exactly equal to the value issued in the trusted token.', 'An empty audience is accepted only while the corresponding trust integration is disabled.', 'Changes which issued tokens the verifier accepts for this protected operation.', 'A mismatch rejects legitimate tokens; an overly broad audience can accept tokens intended for another service.');
  if (last === 'issuer') return set('token-issuer', `Sets the trusted token issuer for ${parent}.`, 'A non-empty issuer identifier exactly matching the signed token claim and configured authority.', 'An empty issuer is accepted only while the trust integration is disabled.', 'Changes which signing authority can issue accepted tokens.', 'A mismatch rejects valid work; trusting the wrong issuer expands authority to unintended tokens.');
  if (last === 'subject' || last === 'pipelinePreferenceSubject') return set('identity-subject', `Selects the authenticated subject matched by ${parent}.`, 'A non-empty subject identifier in the namespace of the configured issuer or runtime identity provider.', 'An empty subject removes this explicit identity match and is accepted only on a disabled or optional path.', 'Changes which identity receives the linked permission, preference, or execution mode.', 'A wrong subject denies the intended actor or grants behavior to another identity.');
  if (last === 'leaseApiGroup' || last === 'leaseApiVersion' || last === 'apiVersion') return set('api-contract-identity', `Selects the Kubernetes API ${last === 'leaseApiGroup' ? 'group' : 'version'} used by ${parent}.`, 'The exact installed API group or version string used by the corresponding CRD or projected field.', 'An empty value cannot identify the API contract.', 'Changes which API resource contract the controller, RBAC rule, or downward-API projection targets.', 'A mismatch produces not-found, forbidden, or invalid-resource errors and prevents lease or projection behavior.');
  if (last === 'contractVersion') return set('code-bundle-contract-version', `Selects the manifest contract version accepted by ${parent}.`, 'Exactly `v2` for code bundles produced and accepted by the checked-in release tooling.', 'An empty value is rendered as the chart default `v2`.', 'Changes the manifest format that the init verifier requires before it installs the bundle.', 'A value other than the bundle manifest contract makes initialization stop with a contract mismatch.');
  if (last === 'expectedCommit') return set('code-bundle-commit', `Pins the source commit that ${parent} must report in its manifest.`, 'An empty string, or the complete immutable Git commit identifier emitted by the checked-in release materializer.', 'An empty value disables the commit-equality check while SHA-256 content verification remains active.', 'Changes which source revision the verified archive is permitted to contain.', 'A non-empty value that differs from the manifest commit stops initialization before code is installed.');
  if (last === 'authorityRevision') return set('product-authority-revision-marker', `Supplies the required authority-revision marker for ${parent}.`, 'A non-empty string of at most 2048 characters while product decisions are enabled.', 'An empty value stops Helm rendering when product decisions are enabled. The current templates do not pass a non-empty marker to the Prism process.', 'Currently, changing one non-empty marker to another changes validation input but has no proved runtime effect. This is an explicit implementation limit.', 'An empty marker stops Helm rendering. A stale non-empty marker is not detected at runtime because the current deployment does not deliver it to the process.');
  if (last === 'controllerRelease') return set('controller-release-label', `Selects the controller release label allowed by the ${parent} egress policy.`, 'A valid Kubernetes label value that exactly matches `app.kubernetes.io/instance` on the intended controller Pod.', 'An empty value stops Helm rendering while product decisions are enabled.', 'Changes which controller Pods the NetworkPolicy permits Prism to contact on TCP port 8443.', 'A malformed value fails admission. A valid but mismatched value blocks all product-decision controller connections.');
  if (last === 'channelId') return set('discord-channel-id', `Selects the Discord channel used by ${parent}.`, 'A decimal Discord snowflake identifier represented as a string.', 'An empty value leaves the Discord integration without a selected channel and is accepted only when it is disabled.', 'Changes where the agent receives commands or sends messages.', 'A malformed, missing, or unauthorized channel produces Discord API failures or routes messages incorrectly.');
  if (['eslintConfigMjs', 'semgrepConfigYaml', 'swarmConfigJson'].includes(last)) return set('embedded-configuration-document', `Provides the complete ${words(last)} document stored in the rendered runtime ConfigMap.`, last === 'swarmConfigJson' ? 'Valid JSON accepted by the swarm configuration loader.' : last === 'semgrepConfigYaml' ? 'Valid YAML accepted by Semgrep.' : 'Valid JavaScript module source accepted by the selected ESLint runtime.', 'An empty document removes the selected tool or swarm policy and is accepted only when the receiving loader explicitly supports that state.', 'Changes lint rules, static-analysis policy, or runtime swarm behavior for the release.', 'Invalid syntax or unsupported settings make the tool or runtime configuration load fail.');
  if (['agents', 'bootstrap', 'identity', 'memory', 'soul', 'tools', 'user'].includes(last) && p.startsWith('workspace.')) return set('workspace-document', `Supplies the ${last.toUpperCase()} workspace document materialized for the agent.`, 'UTF-8 text accepted by the OpenClaw workspace contract for this named document.', 'Empty text creates or preserves an empty document; `workspace.enabled=false` omits workspace materialization.', 'Changes the instructions, identity, memory, tools, or user context available to the agent.', 'Malformed or contradictory content can make startup validation fail or cause incorrect agent behavior.');
  if (last === 'nodeOptions' || last === 'extraArgs') return set('process-options', `Supplies additional ordered process options for ${parent}.`, 'A command-line string accepted by the selected executable; quoting and option order must match that parser.', 'An empty value supplies no additional options.', 'Changes memory limits, networking, or other process startup behavior without changing the image.', 'An unsupported or malformed option makes the process exit or start with unintended behavior.');
  if (last === 'stream') return set('redis-stream-name', `Selects the Redis Stream checked by ${parent}.`, 'A non-empty Redis key name that matches the producer and consumer configuration.', 'An empty value leaves the dependency probe without a stream target.', 'Changes which pipeline event stream is checked for readiness.', 'A wrong key reports false readiness or failure and does not verify the active pipeline stream.');
  if (last === 'maxLen') return set('redis-stream-length', `Sets the maximum Redis Stream length accepted by ${parent}.`, 'A positive safe integer; this baseline uses approximate stream trimming at the selected maximum.', 'An empty, zero, negative, or fractional value fails runtime configuration validation.', 'Changes retained readiness-event history and Redis memory consumption.', 'A very small value removes evidence too quickly; an excessive value grows memory use; invalid input stops configuration.');
  if (last === 'nodeCaFile' || last === 'socketPath' || last === 'drainFile' || (last === 'path' && p.includes('hostPath'))) return set('host-path', `Selects the host or Unix-socket path used by ${parent}.`, 'An absolute path on the node or inside the agreed host mount.', 'An empty path disables the reference only where the parent integration is disabled; otherwise startup validation fails.', 'Changes which CA, socket, drain marker, or host directory the workload uses.', 'A missing, wrong, or inaccessible path causes TLS, identity, shutdown, or volume setup failure.');
  if (last === 'transport') return set('registry-transport', `Selects the registry transport security mode for ${parent}.`, '`https`, or the explicitly supported `http-lab` mode for an anonymous laboratory registry.', 'An empty value cannot authorize clear-text transport and leaves the registry client contract incomplete.', 'Changes TLS verification and whether credentials or content travel over an authenticated encrypted channel.', 'An unsupported mode stops validation; unsafe HTTP outside the lab exposes registry traffic and credentials.');
  if (last === 'type' && p === 'service.type') return set('service-type', 'Selects how Kubernetes exposes the KubeClaw Service.', '`ClusterIP`, `NodePort`, or `LoadBalancer`, subject to cluster support.', 'An empty value is invalid; removing it uses the chart default.', 'Changes the network exposure boundary and the Service fields rendered by the chart.', 'An unsupported type fails admission; an unsuitable type makes the service unreachable or exposes it unexpectedly.');
  if (last === 'installMode') return set('plugin-install-mode', 'Selects the verified installation mechanism for seeded OpenClaw plugins.', 'Exactly an installation mode implemented by the init setup; this baseline uses `official-npm-v1`.', 'An empty mode cannot select a trusted installer.', 'Changes package resolution, integrity verification, and the files installed before the gateway starts.', 'An unsupported mode stops init setup and prevents the application containers from starting.');
  if (last === 'specs') return set('plugin-package-spec', 'Adds one ordered plugin package specification to the offline startup seed.', 'A pinned package specification accepted by the selected install mode, including an explicit package version.', 'An empty list item is invalid; an empty list installs no seeded plugin.', 'Changes plugin code installed before the gateway starts and therefore changes available runtime extensions.', 'An invalid, unavailable, or unverified package stops init setup.');
  if (last === 'trustDomain') return set('spiffe-trust-domain', `Selects the SPIFFE trust domain used by ${parent}.`, 'A non-empty SPIFFE trust-domain name shared by SPIRE and every participating workload.', 'An empty value cannot construct a valid SPIFFE ID and is accepted only while SPIFFE trust is disabled.', 'Changes the identity namespace against which workload certificates and authorization rules are matched.', 'A mismatch prevents workload attestation or mutual authentication.');
  if (last === 'csiDriver') return set('csi-driver-name', `Selects the CSI driver that mounts the SPIFFE workload API socket for ${parent}.`, 'The exact installed CSIDriver name; this platform uses `csi.spiffe.io`.', 'An empty value leaves the Pod without a socket provider and is accepted only while SPIFFE trust is disabled.', 'Changes which node plugin supplies the identity socket volume.', 'A missing or wrong driver leaves the Pod Pending with a volume mount failure.');
  if (last === 'maximumBytes' || last === 'maximumRetainedBytes') return set('byte-capacity-limit', `Sets the byte ceiling for ${parent}.`, 'A positive integer encoded as a decimal string; the retained ceiling must safely exceed one backup ceiling.', 'An empty, zero, negative, or non-numeric value fails backup policy validation.', 'Changes the maximum backup size or total retained local backup material.', 'A limit below actual data makes backup or retention checks fail; an excessive limit can exhaust the volume.');
  if (last === 'nodeName') return set('native-node-name', `Binds ${parent} to one Kubernetes node.`, 'A non-empty Kubernetes node name that exists and matches the native worker policy.', 'An empty value is accepted only when native scheduling is disabled; the active native path requires it.', 'Changes the sole node on which the native worker workload can schedule.', 'A missing or wrong node leaves the Pod Pending or targets a host without the required policy.');
  if (last === 'fieldPath') return set('downward-api-field', `Selects the Kubernetes object field projected for ${parent}.`, 'A fieldPath supported by the downward API; this profile uses an exact metadata field.', 'An empty path cannot select projected data.', 'Changes which Pod metadata value appears in the projected file.', 'An unsupported path fails admission or volume setup.');
  if (last === 'verifyKey') return set('verification-key-material', `Supplies the public verification key used by ${parent}.`, 'A public key in the exact encoding accepted by the namespace-controller token verifier.', 'An empty value disables verification only while the associated product-decision integration is disabled.', 'Changes which signatures the controller accepts as authoritative decisions.', 'Malformed key material stops configuration; the wrong key rejects valid decisions or trusts another signer.');
  if (p.startsWith('secrets.') && ['database', 'runtime'].includes(last)) return set('object-reference', `Selects the existing Kubernetes Secret that supplies Prism ${last} credentials.`, 'A DNS-compatible Secret name in the release namespace.', 'An empty name leaves enabled Prism workloads without required credentials.', 'Changes which Secret object supplies database or runtime authentication to the linked workloads.', 'A missing Secret prevents Pod materialization or makes database and runtime authentication fail.');
  if (last === 'path' && p.includes('projected.sources')) return set('projected-file-path', `Selects the relative projected-volume file path for ${parent}.`, 'A clean, non-absolute path without `..` that is valid inside a Kubernetes projected volume.', 'An empty path cannot name the projected file.', 'Changes where the service-account token, ConfigMap entry, or downward-API value appears in the mounted volume.', 'An invalid path fails admission; a mismatch makes the consuming process unable to find the projected data.');
  if (last === 'type' && p.includes('hostPath')) return set('host-path-type', `Selects the Kubernetes hostPath type check for ${parent}.`, 'One Kubernetes hostPath type such as `Directory`, `DirectoryOrCreate`, `File`, or `Socket`.', 'An omitted type performs no pre-mount type check; an empty scalar is invalid.', 'Controls whether kubelet requires or creates the selected host path before mounting it.', 'A missing path or wrong filesystem type prevents Pod volume setup.');
  if (last === 'origin') return set('trusted-web-origin', `Selects the trusted web origin used by ${parent}.`, 'An absolute HTTPS origin without a path, query, or fragment.', 'An empty origin is accepted only while product decisions are disabled.', 'Changes the browser or service origin accepted by the controller trust policy.', 'A mismatch rejects legitimate requests; an overly broad or insecure origin weakens request-boundary protection.');
  if (/secret/iu.test(p) && (last === 'key' || last === 'name')) return set(last === 'key' ? 'secret-key-reference' : 'object-reference', last === 'key' ? `Selects the data key inside the Secret used by ${parent}.` : `Selects the existing Kubernetes Secret used by ${parent}.`, last === 'key' ? 'A non-empty Kubernetes Secret data-key string.' : 'A DNS-compatible Secret name in the release namespace.', 'An empty value cannot resolve the referenced credential.', 'Changes the credential material exposed to the linked workload.', 'A missing Secret or key prevents Pod materialization or makes the receiving client fail authentication.');
  if (last === 'value') return set('literal-process-value', `Sets the literal value consumed by ${parent}.`, 'A string accepted by the exact receiving process contract identified by the linked container and environment name.', 'An empty string is delivered literally and can differ from an omitted setting.', 'Changes the receiving process behavior at startup or runtime.', 'An unsupported value makes the process reject configuration, remain unready, or use unintended default behavior.');
  if (last === 'name' && /volumeMounts/iu.test(p)) return set('volume-name-reference', `Selects the Pod volume mounted by ${parent}.`, 'A DNS-label name that exactly matches one volume in the same Pod specification.', 'An empty name is invalid for a volumeMount.', 'Changes which volume content appears at the paired mount path.', 'A missing or mismatched volume name fails Pod admission and prevents startup.');
  if (last === 'name' && /extraVolumes/iu.test(p) && !/sources/iu.test(p)) return set('volume-name-definition', `Defines the Pod volume name for ${parent}.`, 'A unique DNS-label name within the Pod specification.', 'An empty or duplicate volume name is invalid.', 'Creates the identifier that container volumeMount entries must reference.', 'A malformed or duplicate name fails admission; an unreferenced name leaves the volume unused.');
  if (last === 'name' && /(?:extraPorts|\.ports)/iu.test(p)) return set('port-name', `Defines the named port identifier for ${parent}.`, 'A unique lower-case IANA service name of at most 15 characters within the container or Service.', 'An empty name removes named lookup only where Kubernetes permits an unnamed port; this explicit entry expects a name.', 'Lets probes, Services, and clients refer to the port without copying its number.', 'A malformed or duplicate name fails admission; a mismatched name leaves Service or probe routing unresolved.');
  if (last === 'name' && /configMap/iu.test(p)) return set('object-reference', `Selects the existing Kubernetes ConfigMap used by ${parent}.`, 'A DNS-compatible ConfigMap name in the release namespace.', 'An empty name cannot resolve projected configuration.', 'Changes which ConfigMap supplies projected files to the workload.', 'A missing ConfigMap prevents volume materialization unless the source is explicitly optional.');
  if (last === 'name' && /extraContainers/iu.test(p)) return set('container-name', `Defines the container name for ${parent}.`, 'A unique DNS-label name within the Pod specification.', 'An empty or duplicate container name is invalid.', 'Sets the stable identity used in logs, status, policy, and container-specific operations.', 'A malformed or duplicate name fails Pod admission; changing it also changes operational lookup and metrics labels.');
  if (last === 'name') return set('runtime-name', `Sets the runtime identifier used by ${parent}.`, 'A non-empty identifier accepted by the exact receiving process contract.', 'An empty identifier cannot select the referenced runtime item.', 'Changes the identity used for lookup and cross-reference in the receiving process.', 'A malformed or mismatched name is rejected or leaves the process reference unresolved.');
  if (field.type === 'boolean') return { ...base, group: 'boolean-control', acceptedValues: '`true` or `false`.' };
  if (field.type === 'integer') return { ...base, group: 'bounded-integer', acceptedValues: 'A safe base-10 integer within the receiving API or process limit documented by the exact consumer.' };
  return { ...base, selectedBaseline: current };
}

const data = {
  version: 2,
  generatedBy: 'scripts/generate-local-helm-authorities.mjs',
  semanticPolicy: 'Evidence and selected baselines are refreshed automatically. Purpose, accepted values, empty behavior, impact, and failure text must exist as an explicit field contract before this command runs.',
  charts: {},
  files: {},
};
for (const field of local) {
  const chartRoot = chartRootFor(field.sourcePath);
  data.files[field.sourcePath] ??= { sourceSha256: sourceDigest(field.sourcePath), chartRoot, fields: {} };
  if (data.files[field.sourcePath].fields[field.path]) throw new Error(`duplicate local Helm field ${field.sourcePath}#${field.path}`);
  const environment = runtimeEnvironmentContract(field);
  // One maintenance transition accepts the former ambiguous dotted spelling as
  // the semantic source.  The generated registry always writes the quoted key,
  // so normal check mode cannot keep or recreate the ambiguous form.
  const legacyPath = `$.${canonicalHelmPath(field.path)}`;
  const approved = approvedRegistry.files?.[field.sourcePath]?.fields?.[field.path]
    ?? approvedRegistry.files?.[field.sourcePath]?.fields?.[legacyPath];
  if (!approved) {
    throw new Error(`LOCAL_HELM_AUTHORITY_REQUIRED: ${field.sourcePath}#${field.path} has a render binding but no explicitly maintained semantic contract`);
  }
  const {
    selectedBaseline: _oldBaseline,
    consumerProof: _oldConsumerProof,
    runtimeConsumerProof: _oldRuntimeConsumerProof,
    ...approvedSemantics
  } = approved;
  const literalCapabilityKey = /\.capabilities\["([^"]+)"\]/u.exec(field.path)?.[1] ?? null;
  if (literalCapabilityKey) {
    const ambiguousPhrase = ` / ${literalCapabilityKey.split('.').join(' / ')}`;
    approvedSemantics.purpose = approvedSemantics.purpose.replace(
      ambiguousPhrase,
      ` / literal capability key \`${literalCapabilityKey}\``,
    );
    assert(approvedSemantics.purpose.includes(`literal capability key \`${literalCapabilityKey}\``),
      `${field.sourcePath}#${field.path}: purpose must identify the dotted capability identifier as one literal map key`);
  }
  data.files[field.sourcePath].fields[field.path] = {
    ...approvedSemantics,
    semanticAuthority: 'explicit-field-contract',
    selectedBaseline: field.value,
    runtimeConsumerProof: environment ? (environment.runtimeReaders.length > 0
      ? environment.runtimeReaders.map((reader) => ({
        path: reader.path,
        line: reader.line,
        kind: 'checked-in-runtime-reader',
        access: reader.access,
        environment: environment.entry.name,
      }))
      : [{
        path: field.sourcePath,
        line: field.consumers[0]?.line ?? 1,
        kind: 'selected-image-runtime-boundary',
        environment: environment.entry.name,
        authority: 'The repository proves injection but contains no non-Kubernetes reader. The selected container image owns parsing and validation.',
      }]) : [],
    consumerProof: field.consumers.map((consumer) => templateEvidence({
      ...consumer,
      sourcePath: field.sourcePath,
      fieldPath: field.path,
      sourceSha256: sourceDigest(field.sourcePath),
    }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}
for (const chartRoot of [...new Set(local.map((field) => chartRootFor(field.sourcePath)))].sort()) {
  const directory = path.join(root, chartRoot, 'templates');
  const templates = fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, '/')).sort();
  data.charts[chartRoot] = { templates: Object.fromEntries(templates.map((relative) => [relative, sourceDigest(relative)])) };
}
const output = `${JSON.stringify(data, null, 2)}\n`;
let stale = false;
if (checkOnly) {
  stale = !fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output;
} else {
  fs.writeFileSync(outputPath, output);
}
fs.rmSync(candidateDirectory, { recursive: true, force: true });
if (stale) throw new Error('local Helm field authority registry is stale; run node scripts/generate-local-helm-authorities.mjs');
console.log(checkOnly
  ? `local Helm field authority registry is current (${local.length} exact authorities)`
  : `wrote ${local.length} exact local Helm field authorities`);
