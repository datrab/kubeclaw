#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { yamlFieldPathTokens } from './yaml-field-path.mjs';

const root = process.cwd();
const refresh = process.argv.includes('--refresh');
const artifactPath = path.join(root, 'scripts/external-helm-authority-snapshots.json');
const checksumPath = path.join(root, 'scripts/external-helm-authority-snapshots.sha256');
const lockPath = path.join(root, 'scripts/docs-external-helm-authority-lock.json');
const inventoryPath = path.join(root, 'docs/generated/inventory/configuration-values.json');
const archiveDirectory = path.join(root, 'scripts/vendor/external-helm-charts');
const archiveManifestPath = path.join(root, 'scripts/external-helm-archives.json');
const archiveManifestChecksumPath = path.join(root, 'scripts/external-helm-archives.sha256');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

function valueAt(value, tokens) {
  return tokens.reduce((current, token) => current?.[token], value);
}

function nearestValue(value, tokens) {
  for (let length = tokens.length; length >= 0; length -= 1) {
    const selected = valueAt(value, tokens.slice(0, length));
    if (selected !== undefined) {
      const encoded = JSON.stringify(stable(selected));
      return {
        path: tokens.slice(0, length),
        valueKind: Array.isArray(selected) ? 'array' : selected === null ? 'null' : typeof selected,
        valueSha256: sha256(encoded),
        value: encoded.length <= 1000 ? selected : undefined,
        topLevelKeys: encoded.length > 1000 && selected && typeof selected === 'object' ? Object.keys(selected).sort() : undefined,
      };
    }
  }
  throw new Error(`values.yaml has no ancestor for ${tokens.join('.')}`);
}

function schemaAt(schema, tokens) {
  let current = schema;
  const resolved = [];
  for (const token of tokens) {
    if (!current) break;
    if (typeof token === 'number') current = current.items;
    else current = current.properties?.[token] ?? (typeof current.additionalProperties === 'object' ? current.additionalProperties : null);
    if (!current) break;
    resolved.push(token);
  }
  if (!current) return null;
  const selected = Object.fromEntries(['type', 'description', 'default', 'enum', 'minimum', 'maximum', 'pattern', 'format', 'required']
    .filter((key) => current[key] !== undefined).map((key) => [key, current[key]]));
  return { path: resolved, contract: selected };
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function templateEvidence(chartDirectory, tokens) {
  const stringTokens = tokens.filter((token) => typeof token === 'string');
  const candidates = [];
  for (let length = stringTokens.length; length > 0; length -= 1) candidates.push(`.Values.${stringTokens.slice(0, length).join('.')}`);
  const result = [];
  for (const absolute of walk(path.join(chartDirectory, 'templates'))) {
    const lines = fs.readFileSync(absolute, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const matchedPrefix = candidates.find((candidate) => line.includes(candidate));
      if (!matchedPrefix) return;
      const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join('\n');
      result.push({
        path: path.relative(chartDirectory, absolute).replaceAll(path.sep, '/'),
        line: index + 1,
        matchedPrefix,
        context,
        contextSha256: sha256(context),
      });
    });
  }
  const mostSpecific = Math.max(0, ...result.map((item) => item.matchedPrefix.split('.').length));
  return result.filter((item) => item.matchedPrefix.split('.').length === mostSpecific)
    .sort((left, right) => `${left.path}:${left.line}`.localeCompare(`${right.path}:${right.line}`));
}

function extractChart(key, chart, archive, directory) {
  const archiveBytes = fs.readFileSync(archive);
  assert.equal(sha256(archiveBytes), chart.archiveSha256, `${key}: archive digest differs from the checked-in lock`);
  const extracted = path.join(directory, 'extracted');
  fs.mkdirSync(extracted);
  const untarred = spawnSync('tar', ['-xzf', archive, '-C', extracted], { encoding: 'utf8' });
  if (untarred.status !== 0) throw new Error(`${key}: chart extraction failed: ${untarred.stderr}`);
  const children = fs.readdirSync(extracted).map((name) => path.join(extracted, name)).filter((candidate) => fs.statSync(candidate).isDirectory());
  assert.equal(children.length, 1, `${key}: archive does not contain one chart directory`);
  return children[0];
}

function pullChart(key, chart, directory) {
  const isOci = !chart.repository.startsWith('http');
  const reference = isOci ? `oci://${chart.repository}/${chart.chart}` : chart.chart;
  const args = ['pull', reference, '--version', chart.version, '--destination', directory];
  if (!isOci) args.push('--repo', chart.repository);
  const pulled = spawnSync('helm', args, { cwd: root, encoding: 'utf8' });
  if (pulled.status !== 0) throw new Error(`failed to pull ${key}: ${pulled.stderr || pulled.stdout}`);
  const archives = fs.readdirSync(directory).filter((name) => name.endsWith('.tgz'));
  assert.equal(archives.length, 1, `${key}: expected one chart archive`);
  const archive = path.join(directory, archives[0]);
  const archiveBytes = fs.readFileSync(archive);
  assert.equal(sha256(archiveBytes), chart.archiveSha256, `${key}: archive digest differs from the checked-in lock`);
  return archive;
}

function inventoryExternalFields() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const result = [];
  for (const file of inventory.files) for (const document of file.documents) for (const field of document.fields ?? []) {
    if (field.meaning?.status !== 'external-chart-authority') continue;
    result.push({ sourcePath: file.path, fieldPath: field.path, selectedValue: field.value, externalChart: field.meaning.externalChart });
  }
  return result;
}

function deriveArtifact(archiveManifest) {
  const fields = inventoryExternalFields();
  const output = { version: 2, generatedBy: 'scripts/vendor-external-helm-authorities.mjs', lockSha256: sha256(fs.readFileSync(lockPath)), archiveManifestSha256: sha256(fs.readFileSync(archiveManifestPath)), charts: {}, templateContexts: {}, fields: {} };
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-external-helm-authority-'));
  try {
    for (const [key, chart] of Object.entries(lock.charts)) {
      const directory = path.join(temporaryRoot, key);
      fs.mkdirSync(directory);
      const archiveEntry = archiveManifest.charts[key];
      assert(archiveEntry, `${key}: vendored chart archive manifest entry is missing`);
      assert.equal(archiveEntry.sha256, chart.archiveSha256, `${key}: vendored archive manifest differs from chart lock`);
      const archive = path.join(root, archiveEntry.path);
      assert(fs.existsSync(archive), `${key}: vendored chart archive is missing: ${archiveEntry.path}`);
      const archiveBytes = fs.readFileSync(archive);
      assert.equal(archiveBytes.length, archiveEntry.size, `${key}: vendored archive byte count changed`);
      assert.equal(sha256(archiveBytes), archiveEntry.sha256, `${key}: vendored archive bytes changed`);
      const chartDirectory = extractChart(key, chart, archive, directory);
      const valuesBytes = fs.readFileSync(path.join(chartDirectory, 'values.yaml'));
      assert.equal(sha256(valuesBytes), chart.valuesSha256, `${key}: extracted values.yaml digest differs from the checked-in lock`);
      const schemaPath = path.join(chartDirectory, 'values.schema.json');
      const schemaBytes = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath) : null;
      if (chart.schemaSha256) {
        assert(schemaBytes, `${key}: locked schema is missing from archive`);
        assert.equal(sha256(schemaBytes), chart.schemaSha256, `${key}: extracted schema digest differs from the checked-in lock`);
      }
      const values = YAML.parse(valuesBytes.toString('utf8'));
      const schema = schemaBytes ? JSON.parse(schemaBytes) : null;
      output.charts[key] = { ...chart, extractedValuesSha256: sha256(valuesBytes), extractedSchemaSha256: schemaBytes ? sha256(schemaBytes) : null };
      for (const field of fields.filter((item) => item.externalChart.chart === chart.chart && item.externalChart.version === chart.version
        && item.externalChart.archiveSha256 === chart.archiveSha256)) {
        const tokens = yamlFieldPathTokens(field.fieldPath);
        const upstream = nearestValue(values, tokens);
        const schemaContract = schemaAt(schema, tokens);
        const templates = templateEvidence(chartDirectory, tokens);
        const templateContextIds = templates.map((template) => {
          const id = sha256(JSON.stringify(stable(template)));
          output.templateContexts[id] ??= template;
          return id;
        });
        const keyName = `${field.sourcePath}#${field.fieldPath}`;
        output.fields[keyName] = {
          chartKey: key,
          selectedValue: field.selectedValue,
          upstreamValue: upstream,
          schema: schemaContract,
          templateContextIds,
          authorityMode: templateContextIds.length ? 'extracted-template-and-values' : schemaContract ? 'extracted-schema-and-values' : 'extracted-values-nearest-ancestor',
        };
      }
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  return `${JSON.stringify(stable(output), null, 2)}\n`;
}

function refreshArtifact() {
  fs.mkdirSync(archiveDirectory, { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-external-helm-download-'));
  const manifest = { version: 1, generatedBy: 'scripts/vendor-external-helm-authorities.mjs --refresh', charts: {} };
  try {
    for (const [key, chart] of Object.entries(lock.charts)) {
      const directory = path.join(temporaryRoot, key);
      fs.mkdirSync(directory);
      const downloaded = pullChart(key, chart, directory);
      const fileName = `${chart.archiveSha256}.tgz`;
      const destination = path.join(archiveDirectory, fileName);
      fs.copyFileSync(downloaded, destination);
      const bytes = fs.readFileSync(destination);
      manifest.charts[key] = {
        chart: chart.chart,
        version: chart.version,
        repository: chart.repository,
        path: path.relative(root, destination).replaceAll(path.sep, '/'),
        sha256: sha256(bytes),
        size: bytes.length,
      };
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  const manifestBytes = `${JSON.stringify(stable(manifest), null, 2)}\n`;
  fs.writeFileSync(archiveManifestPath, manifestBytes);
  fs.writeFileSync(archiveManifestChecksumPath, `${sha256(manifestBytes)}  ${path.basename(archiveManifestPath)}\n`);
  const bytes = deriveArtifact(manifest);
  fs.writeFileSync(artifactPath, bytes);
  fs.writeFileSync(checksumPath, `${sha256(bytes)}  ${path.basename(artifactPath)}\n`);
}

function checkArtifact() {
  assert(fs.existsSync(artifactPath) && fs.existsSync(checksumPath), 'external Helm extracted authority artifact is missing; run with --refresh');
  assert(fs.existsSync(archiveManifestPath) && fs.existsSync(archiveManifestChecksumPath), 'vendored external Helm archive manifest is missing; run with --refresh');
  const manifestBytes = fs.readFileSync(archiveManifestPath);
  const [manifestExpected, manifestName] = fs.readFileSync(archiveManifestChecksumPath, 'utf8').trim().split(/\s+/u);
  assert.equal(manifestName, path.basename(archiveManifestPath), 'external Helm archive checksum names the wrong manifest');
  assert.equal(sha256(manifestBytes), manifestExpected, 'external Helm archive manifest bytes changed');
  const archiveManifest = JSON.parse(manifestBytes);
  const bytes = fs.readFileSync(artifactPath);
  const artifact = JSON.parse(bytes);
  const [expected, name] = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/u);
  assert.equal(name, path.basename(artifactPath), 'external Helm snapshot checksum names the wrong file');
  assert.equal(sha256(bytes), expected, 'external Helm extracted authority bytes changed');
  const recomputedBytes = deriveArtifact(archiveManifest);
  assert.equal(bytes.toString('utf8'), recomputedBytes, 'external Helm authority snapshot does not match a fresh offline extraction from vendored chart archives');
  assert.equal(artifact.lockSha256, sha256(fs.readFileSync(lockPath)), 'external Helm extracted authority uses a different chart lock');
  const inventoryFields = inventoryExternalFields();
  assert.equal(Object.keys(artifact.fields).length, inventoryFields.length, 'external Helm extracted field count differs from the inventory');
  for (const field of inventoryFields) {
    const key = `${field.sourcePath}#${field.fieldPath}`;
    const proof = artifact.fields[key];
    assert(proof, `${key}: extracted external Helm authority is missing`);
    assert(proof.templateContextIds.length || proof.schema || proof.upstreamValue, `${key}: extracted authority has no vendored input`);
    assert.match(proof.upstreamValue?.valueSha256 ?? '', /^[a-f0-9]{64}$/u, `${key}: extracted upstream values evidence has no content digest`);
    for (const id of proof.templateContextIds) {
      const template = artifact.templateContexts[id];
      assert(template, `${key}: extracted template context ${id} is missing`);
      assert.equal(sha256(JSON.stringify(stable(template))), id, `${key}: extracted template context identity changed`);
      assert.equal(sha256(template.context), template.contextSha256, `${key}: extracted template context changed`);
    }
  }
  for (const [key, chart] of Object.entries(lock.charts)) assert.deepEqual(artifact.charts[key], {
    ...chart,
    extractedValuesSha256: chart.valuesSha256,
    extractedSchemaSha256: chart.schemaSha256 ?? null,
  }, `${key}: extracted chart coordinate or content digest differs from the lock`);
  console.log(`external Helm authority snapshots are current (${inventoryFields.length} exact fields across ${Object.keys(lock.charts).length} charts)`);
}

if (refresh) refreshArtifact();
checkArtifact();
