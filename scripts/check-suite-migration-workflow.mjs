#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { verifyProductionReceipt } from './production-receipt-attestation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realRoot = fs.realpathSync(root);
const mode = process.argv[2] ?? 'all';
const suiteFilter = process.argv[3];
const errors = [];
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const exists = (relative) => fs.existsSync(path.join(root, relative));

const statusPath = 'docs/architecture/pipeline-test-gate-suite-migration-status.json';
const status = readJson(statusPath);
const allowedState = new Set(['pending', 'in-progress', 'complete']);
const allowedAcceptanceState = new Set(['pending', 'complete']);
const allowedDisposition = new Set(['preserved', 'improved', 'removed-defect', 'deferred', 'blocked']);
const gitRevision = /^[a-f0-9]{40,64}$/u;
const digest = /^sha256:[a-f0-9]{64}$/u;
const productionReceiptTrustedPublicKeyFile = '/etc/kubeclaw/production-receipt-authority.pub';
const productionRequiredSuites = new Set(['unit', 'build', 'k8s', 'health', 'tailscale-preview', 'a11y', 'perf', 'visual-reg', 'e2e', 'security']);
const productionReceiptIdentity = new Map([
  ['unit', { schemaVersion: 'nova-unit-production-preflight.v2', suite: 'unit' }],
  ['build', { schemaVersion: 'nova-container-build-production-preflight.v4', suite: 'build' }],
  ['k8s', { schemaVersion: 'kubernetes-fixture-production-preflight.v1', suite: 'k8s' }],
  ['health', { schemaVersion: 'nova-http-production-preflight.v1', suite: 'health' }],
  ['a11y', { schemaVersion: 'nova-a11y-production-preflight.v1', suite: 'a11y' }],
  ['perf', { schemaVersion: 'nova-lighthouse-production-preflight.v1', suite: 'perf' }],
  ['visual-reg', { schemaVersion: 'nova-visual-production-preflight.v1', suite: 'visual-reg' }],
  ['e2e', { schemaVersion: 'nova-e2e-production-preflight.v1', suite: 'e2e' }],
  ['security', { schemaVersion: 'nova-security-production-preflight.v1', suite: 'security' }],
  ['tailscale-preview', {
    schemaVersion: 'nova-tailscale-production-preflight.v1', suite: 'tailscale-preview',
  }],
]);

function isContained(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) return false;
  const resolved = path.resolve(root, relative);
  const fromRoot = path.relative(root, resolved);
  return fromRoot !== '' && fromRoot !== '..' && !fromRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(fromRoot);
}

function realContained(relative) {
  if (!isContained(relative)) return false;
  try {
    const resolved = fs.realpathSync(path.resolve(root, relative));
    const fromRoot = path.relative(realRoot, resolved);
    return fromRoot !== '' && fromRoot !== '..' && !fromRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(fromRoot);
  } catch {
    return false;
  }
}

function checkStatus() {
  if (status.schemaVersion !== 'suite-migration-status.v1') errors.push(`${statusPath}: invalid schemaVersion`);
  if (status.totalLegacySuites !== 13 || status.suites.length !== 13) errors.push(`${statusPath}: expected 13 legacy suites`);
  const ids = status.suites.map((suite) => suite.id);
  if (new Set(ids).size !== ids.length) errors.push(`${statusPath}: duplicate suite id`);
  const allSourceCutoversComplete = status.suites.every((suite) => suite.implementation === 'complete'
    && suite.sourceCutover === 'complete');
  for (const suite of status.suites) {
    for (const phase of ['implementation', 'parity', 'cutover']) {
      if (!allowedState.has(suite[phase])) errors.push(`${statusPath}: ${suite.id}.${phase} is invalid`);
    }
    if (!allowedState.has(suite.sourceCutover)) {
      errors.push(`${statusPath}: ${suite.id}.sourceCutover is invalid`);
    }
    if (suite.productionAcceptance !== undefined && !allowedAcceptanceState.has(suite.productionAcceptance)) {
      errors.push(`${statusPath}: ${suite.id}.productionAcceptance is invalid`);
    }
    if (productionRequiredSuites.has(suite.id) && suite.productionAcceptance === undefined) {
      errors.push(`${statusPath}: ${suite.id}.productionAcceptance is required`);
    }
    if (productionRequiredSuites.has(suite.id) && suite.parity === 'complete'
      && suite.productionAcceptance !== 'complete') {
      errors.push(`${statusPath}: ${suite.id} proves parity before production acceptance`);
    }
    if (suite.parity === 'complete' && suite.implementation !== 'complete') errors.push(`${statusPath}: ${suite.id} proves parity before implementation`);
    if (suite.cutover === 'complete' && suite.parity !== 'complete') errors.push(`${statusPath}: ${suite.id} cuts over before parity`);
    if (suite.cutover === 'complete' && suite.productionAcceptance !== undefined
      && suite.productionAcceptance !== 'complete') {
      errors.push(`${statusPath}: ${suite.id} cuts over before production acceptance`);
    }
    if (suite.sourceCutover === 'complete' && suite.implementation !== 'complete') {
      errors.push(`${statusPath}: ${suite.id} completes source cutover before implementation`);
    }
    if (suite.productionAcceptance === 'complete') {
      if (!allSourceCutoversComplete) {
        errors.push(`${statusPath}: ${suite.id} completes production acceptance before all source cutovers`);
      }
      if (!realContained(suite.productionReceipt)) {
        errors.push(`${statusPath}: ${suite.id} has no contained production receipt`);
      } else {
        const receipt = readJson(suite.productionReceipt);
        const expectedIdentity = productionReceiptIdentity.get(suite.id);
        if (!expectedIdentity || receipt.schemaVersion !== expectedIdentity.schemaVersion
          || receipt.suite !== expectedIdentity.suite) {
          errors.push(`${suite.productionReceipt}: receipt identity does not match ${suite.id}`);
        }
        const publicKeyPath = productionReceiptTrustedPublicKeyFile;
        if (!fs.existsSync(publicKeyPath)) {
          errors.push(`${suite.productionReceipt}: trusted production receipt public key is not installed`);
        } else if (!gitRevision.test(suite.productionRevision ?? '')) {
          errors.push(`${statusPath}: ${suite.id}.productionRevision is required`);
        } else if (!gitRevision.test(suite.productionBusterRevision ?? '')) {
          errors.push(`${statusPath}: ${suite.id}.productionBusterRevision is required`);
        } else if (!digest.test(suite.productionReceiptKeyFingerprint ?? '')) {
          errors.push(`${statusPath}: ${suite.id}.productionReceiptKeyFingerprint is required`);
        } else {
          const trustedKey = fs.realpathSync(publicKeyPath);
          const fromRoot = path.relative(realRoot, trustedKey);
          if (fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${path.sep}`)
            && !path.isAbsolute(fromRoot))) {
            errors.push(`${suite.productionReceipt}: trusted public key must be outside the repository`);
          } else {
            const receiptErrors = verifyProductionReceipt(receipt, fs.readFileSync(trustedKey), {
              expectedRevision: suite.productionRevision,
              expectedBusterRevision: suite.productionBusterRevision,
              expectedPublicKeyFingerprint: suite.productionReceiptKeyFingerprint,
            });
            for (const error of receiptErrors) errors.push(`${suite.productionReceipt}: ${error}`);
          }
        }
        const ledger = suite.parityLedger && exists(suite.parityLedger) ? readJson(suite.parityLedger) : null;
        const acceptance = ledger?.entries?.['TSX-CUT-005'];
        if (suite.id === 'tailscale-preview' && (acceptance?.status !== 'proved'
          || !acceptance?.proof?.includes(suite.productionReceipt)
          || ledger?.acceptedDeferral?.status === 'open')) {
          errors.push(`${suite.parityLedger}: production acceptance does not cite the closed receipt`);
        } else if (suite.id !== 'tailscale-preview' && (ledger?.productionAcceptance?.status !== 'proved'
          || ledger?.productionAcceptance?.receipt !== suite.productionReceipt
          || ledger?.acceptedDeferral?.status === 'open')) {
          errors.push(`${suite.parityLedger}: production acceptance does not cite the closed receipt`);
        }
      }
    }
  }
  const bridge = readJson('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json');
  for (const suite of status.suites) {
    const legacy = bridge.suites[suite.id];
    if (!legacy) errors.push(`legacy bridge is missing ${suite.id}`);
    else if ((suite.sourceCutover ?? suite.cutover) === 'complete' && legacy.state !== 'migrated') errors.push(`${suite.id}: source cutover is complete but bridge is not migrated`);
    else if ((suite.sourceCutover ?? suite.cutover) !== 'complete' && legacy.state !== 'unmigrated') errors.push(`${suite.id}: bridge migrated before source cutover`);
    if (legacy?.successor !== suite.successor) errors.push(`${suite.id}: successor differs between status and bridge`);
  }
}

function selectedSuites(phase) {
  return status.suites.filter((suite) => (!suiteFilter || suite.id === suiteFilter) && suite[phase] === 'complete');
}

function checkBaseline() {
  for (const suite of selectedSuites('implementation')) {
    if (!suite.baseline || !exists(suite.baseline)) { errors.push(`${suite.id}: baseline record is missing`); continue; }
    const source = fs.readFileSync(path.join(root, suite.baseline), 'utf8');
    if (!source.trim()) { errors.push(`${suite.baseline}: baseline record is empty`); continue; }
    if (suite.baseline.endsWith('.json')) {
      const baseline = JSON.parse(source);
      if (baseline.legacySuite !== suite.id) errors.push(`${suite.baseline}: legacySuite does not match status`);
      if (baseline.successor !== suite.successor) errors.push(`${suite.baseline}: successor does not match status`);
      if (!Number.isSafeInteger(baseline.expectedItemCount) || baseline.expectedItemCount < 1) errors.push(`${suite.baseline}: expectedItemCount is invalid`);
      if (!Array.isArray(baseline.items) || baseline.items.length < 1) errors.push(`${suite.baseline}: baseline items are missing`);
      else {
        if (baseline.items.length !== baseline.expectedItemCount) errors.push(`${suite.baseline}: item count does not match expectedItemCount`);
        const ids = baseline.items.map((item) => item.id);
        if (new Set(ids).size !== ids.length) errors.push(`${suite.baseline}: duplicate item id`);
        for (const item of baseline.items) {
          for (const field of ['id', 'class', 'requirement', 'state']) {
            if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${suite.baseline}: ${String(item.id)} has no ${field}`);
          }
        }
      }
    } else {
      for (const heading of ['## Current Execution Path', '## Current Configuration', '## Current Parity Inventory', '## Existing Proof Coverage', '## Unit Cutover Deletion Targets']) {
        if (!source.includes(heading)) errors.push(`${suite.baseline}: required section is missing: ${heading}`);
      }
      const ids = [...source.matchAll(/`([A-Z][A-Z0-9]+(?:-[A-Z0-9]+){2,})`/gu)].map((match) => match[1]);
      if (new Set(ids).size < 1) errors.push(`${suite.baseline}: stable baseline items are missing`);
    }
  }
}

function checkParity() {
  for (const suite of status.suites.filter((item) => (!suiteFilter || item.id === suiteFilter)
    && (item.parity === 'complete' || item.productionAcceptance !== undefined))) {
    const ledger = suite.parityLedger;
    if (!ledger) { errors.push(`${suite.id}: parity ledger is not declared`); continue; }
    if (!exists(ledger)) { errors.push(`${suite.id}: parity ledger is missing`); continue; }
    const value = readJson(ledger);
    const items = Array.isArray(value.items) ? value.items : Object.entries(value.entries ?? {}).map(([id, item]) => ({ id, ...item }));
    if (items.length < 1) errors.push(`${ledger}: items are missing`);
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) errors.push(`${ledger}: duplicate item id`);
    const globalProof = Array.isArray(value.proof) && value.proof.length > 0 ? value.proof : null;
    const acceptedDeferral = value.acceptedDeferral?.status === 'open'
      && value.acceptedDeferral?.acceptedBy === 'project-owner'
      && typeof value.acceptedDeferral?.condition === 'string'
      && exists(value.acceptedDeferral?.proof);
    for (const item of items) {
      if (!allowedDisposition.has(item.disposition)) errors.push(`${ledger}: ${item.id} has invalid disposition`);
      if (item.disposition === 'blocked') errors.push(`${ledger}: ${item.id} remains blocked`);
      if (item.status !== undefined && item.status !== 'proved') {
        if (!(item.status === 'deferred' && item.disposition === 'deferred' && acceptedDeferral)) {
          errors.push(`${ledger}: ${item.id} is neither proved nor covered by an accepted deferral`);
        }
      }
      const itemProof = Array.isArray(item.proof) && item.proof.length > 0 ? item.proof : null;
      const proof = itemProof ?? globalProof;
      if (!proof) errors.push(`${ledger}: ${item.id} has no non-empty proof`);
      else for (const proofPath of proof) if (typeof proofPath !== 'string' || !exists(proofPath)) errors.push(`${ledger}: ${item.id} cites missing proof ${String(proofPath)}`);
    }
  }
}

function checkCutover() {
  for (const suite of status.suites.filter((item) => (!suiteFilter || item.id === suiteFilter)
    && (item.sourceCutover ?? item.cutover) === 'complete')) {
    const inventory = suite.cutoverInventory;
    if (!inventory) { errors.push(`${suite.id}: cutover inventory is not declared`); continue; }
    if (!exists(inventory)) { errors.push(`${suite.id}: cutover inventory is missing`); continue; }
    const value = readJson(inventory);
    if (value.suite !== suite.id) errors.push(`${inventory}: suite id does not match status`);
    const deleted = value.legacyFilesToDelete;
    if (!Array.isArray(deleted) || deleted.length < 1) errors.push(`${inventory}: concrete deletion targets are missing`);
    else for (const target of deleted) {
      if (!isContained(target)) errors.push(`${inventory}: invalid deletion target ${String(target)}`);
      else if (exists(target)) errors.push(`${inventory}: legacy deletion target still exists: ${target}`);
    }
    for (const replacement of value.replacementFilesRequired ?? []) {
      if (typeof replacement !== 'string' || !exists(replacement)) errors.push(`${inventory}: required replacement is missing: ${String(replacement)}`);
    }
    const verification = value.verification;
    const tests = new Set();
    for (const kind of ['solePathTests', 'dualAuthorityTests', 'absenceTests']) {
      if (!Array.isArray(verification?.[kind]) || verification[kind].length < 1) errors.push(`${inventory}: ${kind} are missing`);
      else for (const test of verification[kind]) {
        if (!realContained(test)) errors.push(`${inventory}: ${kind} cites unsafe test ${String(test)}`);
        else if (!exists(test)) errors.push(`${inventory}: ${kind} cites missing test ${String(test)}`);
        else tests.add(test);
      }
    }
    for (const test of tests) {
      const result = spawnSync(process.execPath, [fs.realpathSync(path.join(root, test))], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
      });
      if (result.status !== 0) {
        const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        errors.push(`${inventory}: cutover proof failed: ${test}${detail ? `\n${detail}` : ''}`);
      }
    }
    if (Number.isSafeInteger(value.parityItemCount)) {
      const ledger = readJson(suite.parityLedger);
      const count = Array.isArray(ledger.items) ? ledger.items.length : Object.keys(ledger.entries ?? {}).length;
      if (value.parityItemCount !== count) errors.push(`${inventory}: parity item count does not match ledger`);
    }
  }
}

function schemaLeafPaths(schema) {
  const out = new Set();
  function visit(value, prefix = '') {
    if (!value || typeof value !== 'object') return;
    if (value.properties) {
      for (const [name, child] of Object.entries(value.properties)) {
        const next = prefix ? `${prefix}.${name}` : name;
        if (child && typeof child === 'object' && (child.properties || child.oneOf)) visit(child, next);
        else out.add(next);
      }
    }
    for (const choice of value.oneOf ?? []) visit(choice, prefix);
  }
  visit(schema);
  return [...out];
}

function documentationManifests() {
  return fs.readdirSync(path.join(root, 'docs/architecture'))
    .filter((name) => name.endsWith('-documentation-manifest.json'))
    .map((name) => `docs/architecture/${name}`);
}

function combinedDocuments(manifest) {
  return Object.values(manifest.documents).map((relative) => fs.readFileSync(path.join(root, relative), 'utf8')).join('\n');
}

function checkSchemaDocumentation() {
  for (const manifestPath of documentationManifests()) {
    const manifest = readJson(manifestPath);
    for (const document of Object.values(manifest.documents)) if (!exists(document)) errors.push(`${manifestPath}: missing ${document}`);
    const projectSchemas = manifest.projectSchemas ?? [manifest.projectSchema];
    if (!Array.isArray(projectSchemas) || projectSchemas.length < 1 || projectSchemas.some((schema) => !exists(schema))) {
      errors.push(`${manifestPath}: project schema is missing`); continue;
    }
    const reference = fs.readFileSync(path.join(root, manifest.documents.configurationReference), 'utf8');
    for (const projectSchema of projectSchemas) for (const field of schemaLeafPaths(readJson(projectSchema))) {
      if (!reference.includes(`\`${field}\``)) errors.push(`${manifest.documents.configurationReference}: undocumented project field ${field}`);
    }
    for (const field of manifest.operatorFields ?? []) {
      if (!reference.includes(`\`${field}\``)) errors.push(`${manifest.documents.configurationReference}: undocumented operator field ${field}`);
    }
  }
}

function checkErrorDocumentation() {
  for (const manifestPath of documentationManifests()) {
    const manifest = readJson(manifestPath);
    const source = manifest.sourceFilesWithErrors.map((relative) => fs.readFileSync(path.join(root, relative), 'utf8')).join('\n');
    const prefixes = manifest.errorPrefixes ?? [];
    const discovered = source.match(/[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}/gu) ?? [];
    const codes = [...new Set([
      ...discovered.filter((code) => prefixes.some((prefix) => code.startsWith(prefix))),
      ...(manifest.additionalErrors ?? []),
    ])].sort();
    const reference = fs.readFileSync(path.join(root, manifest.documents.errorReference), 'utf8');
    for (const code of codes) if (!reference.includes(`\`${code}\``)) errors.push(`${manifest.documents.errorReference}: undocumented error ${code}`);
  }
}

function findConfigs(value, markers, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (!Array.isArray(value) && markers.some((field) => value[field] !== undefined)) out.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) findConfigs(child, markers, out);
  return out;
}

function checkExamples() {
  for (const manifestPath of documentationManifests()) {
    const manifest = readJson(manifestPath);
    const markers = manifest.configurationMarkerFields ?? ['buildContext', 'definition'];
    if (!Array.isArray(markers) || markers.length < 1 || markers.some((field) => typeof field !== 'string' || !field)) {
      errors.push(`${manifestPath}: configurationMarkerFields are invalid`);
      continue;
    }
    const projectSchemas = manifest.projectSchemas ?? [manifest.projectSchema];
    const validators = projectSchemas.map((schema) => {
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      return ajv.compile(readJson(schema));
    });
    const validateConfig = (config, label) => {
      if (!validators.some((validate) => validate(config))) {
        const details = validators.flatMap((validate) => validate.errors ?? [])
          .map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
        errors.push(`${label}: provider schema rejected example: ${details}`);
      }
    };
    for (const example of manifest.exampleFiles ?? []) {
      if (!exists(example)) { errors.push(`${manifestPath}: missing example ${example}`); continue; }
      const value = readJson(example);
      const configs = findConfigs(value, markers);
      if (configs.length < 1) errors.push(`${example}: no provider config found`);
      configs.forEach((config, index) => validateConfig(config, `${example}#${index + 1}`));
    }
    for (const [kind, document] of Object.entries(manifest.documents)) {
      const text = fs.readFileSync(path.join(root, document), 'utf8');
      const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/gu)];
      for (const [index, block] of blocks.entries()) {
        try {
          const value = JSON.parse(block[1]);
          findConfigs(value, markers).forEach((config, configIndex) => validateConfig(config, `${document}:${kind}:block-${index + 1}.${configIndex + 1}`));
        } catch (error) { errors.push(`${document}: JSON block ${index + 1} does not parse: ${error.message}`); }
      }
    }
  }
}

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/gu, '').replace(/`[^`]+`/gu, 'TERM');
}

function checkControlledLanguage() {
  const targets = [
    'docs/architecture/pipeline-test-gate-suite-migration-playbook.md',
    'docs/architecture/pipeline-test-gate-suite-migration-templates.md',
    ...documentationManifests().flatMap((manifestPath) => Object.values(readJson(manifestPath).documents)),
  ];
  const vague = /\b(simply|obviously|appropriate|properly|normally|just|easy|easily)\b/iu;
  for (const relative of [...new Set(targets)]) {
    if (!exists(relative)) { errors.push(`controlled-language target is missing: ${relative}`); continue; }
    const text = stripCode(fs.readFileSync(path.join(root, relative), 'utf8'));
    if (vague.test(text)) errors.push(`${relative}: contains vague controlled-language term "${vague.exec(text)?.[0]}"`);
    const statements = [];
    let prose = [];
    const flush = () => {
      if (prose.length) statements.push(...prose.join(' ').split(/(?<=[.!?])\s+/gu));
      prose = [];
    };
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('|')) { flush(); continue; }
      if (/^(?:[-*]|\d+[.)])\s+/u.test(line)) { flush(); statements.push(line.replace(/^(?:[-*]|\d+[.)])\s+/u, '')); }
      else prose.push(line);
    }
    flush();
    for (const statement of statements) {
      const words = statement.match(/[A-Za-z0-9][A-Za-z0-9@._/-]*/gu) ?? [];
      if (words.length > 40) errors.push(`${relative}: statement exceeds 40 words: ${statement.slice(0, 100)}...`);
    }
  }
}

const actions = {
  status: checkStatus,
  baseline: checkBaseline,
  parity: checkParity,
  cutover: checkCutover,
  'docs-schema': checkSchemaDocumentation,
  'docs-errors': checkErrorDocumentation,
  'docs-examples': checkExamples,
  'docs-language': checkControlledLanguage,
};

if (mode === 'all') for (const action of Object.values(actions)) action();
else if (actions[mode]) actions[mode]();
else errors.push(`unknown workflow check mode: ${mode}`);

if (errors.length) {
  console.error(`suite migration ${mode} check failed:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`suite migration ${mode} check passed`);
