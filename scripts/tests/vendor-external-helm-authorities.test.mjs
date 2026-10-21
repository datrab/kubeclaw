import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

test('original vendor CLI refreshes offline and preserves other archive owners', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-authorities-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  for (const name of ['vendor-external-helm-authorities.mjs', 'yaml-field-path.mjs']) {
    const original = fs.readFileSync(path.join(repository, 'scripts', name));
    const copy = write('scripts/' + name, original);
    assert.equal(digest(fs.readFileSync(copy)), digest(original));
  }
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const values = 'setting: true\n';
  write('input/fixture/Chart.yaml', 'apiVersion: v2\nname: fixture\nversion: 1.0.0\n');
  write('input/fixture/values.yaml', values);
  const archive = path.join(root, 'fixture.tgz');
  execFileSync('tar', ['--owner=1001', '--group=1001', '-czf', archive,
    '-C', path.join(root, 'input'), 'fixture']);
  const archiveBytes = fs.readFileSync(archive);
  const chart = { chart: 'fixture', version: '1.0.0', repository: 'https://example.invalid',
    archiveSha256: digest(archiveBytes), valuesSha256: digest(values), schemaSha256: null };
  write('scripts/docs-external-helm-authority-lock.json', JSON.stringify({ charts: { fixture: chart } }));
  write('docs/generated/inventory/configuration-values.json', JSON.stringify({ files: [] }));
  const shared = { chart: 'other-consumer', path: 'retained-by-other-owner.tgz', proof: 'preserve-exact-record' };
  const manifest = { version: 1, generatedBy: 'fixture', charts: {
    fixture: { chart: chart.chart, version: chart.version, repository: chart.repository,
      path: 'fixture.tgz', sha256: digest(archiveBytes), size: archiveBytes.length },
    shared,
  } };
  const manifestFile = write('scripts/external-helm-archives.json', JSON.stringify(manifest));
  const checksumFile = write('scripts/external-helm-archives.sha256',
    digest(fs.readFileSync(manifestFile)) + '  external-helm-archives.json\n');
  const bin = path.join(root, 'bin');
  const helm = write('bin/helm', '#!/bin/sh\nexit 42\n');
  fs.chmodSync(helm, 0o700);
  const run = args => spawnSync(process.execPath,
    [path.join(root, 'scripts/vendor-external-helm-authorities.mjs'), ...args], {
      cwd: root, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
      encoding: 'utf8', timeout: 30_000,
    });

  // The failing Helm executable proves this route does not acquire charts.
  const originalManifest = fs.readFileSync(manifestFile);
  let result = run(['--refresh-extracted']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(manifestFile), originalManifest);
  const artifactFile = path.join(root, 'scripts/external-helm-authority-snapshots.json');
  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
  assert.equal(artifact.archiveManifestSha256, digest(originalManifest));
  assert.equal(artifact.charts.fixture.extractedValuesSha256, digest(values));
  const beforeCheck = fs.readFileSync(artifactFile);
  result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(artifactFile), beforeCheck);

  // Only the external acquisition is a fixture; the original refresh stays intact.
  fs.writeFileSync(helm, '#!/usr/bin/env node\n' +
    'const fs=require("node:fs"),path=require("node:path");\n' +
    'const args=process.argv.slice(2),index=args.indexOf("--destination");\n' +
    'if(args[0]!=="pull"||index<0)process.exit(42);\n' +
    'fs.copyFileSync(' + JSON.stringify(archive) + ',path.join(args[index+1],"fixture-1.0.0.tgz"));\n');
  result = run(['--refresh']);
  assert.equal(result.status, 0, result.stderr);
  const refreshedManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.deepEqual(refreshedManifest.charts.shared, shared);
  assert.equal(refreshedManifest.charts.fixture.sha256, chart.archiveSha256);
  assert.equal(JSON.parse(fs.readFileSync(artifactFile, 'utf8')).archiveManifestSha256,
    digest(fs.readFileSync(manifestFile)));

  const beforeRejectedRefresh = fs.readFileSync(artifactFile);
  fs.writeFileSync(checksumFile, '0'.repeat(64) + '  external-helm-archives.json\n');
  result = run(['--refresh-extracted']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /external Helm archive manifest bytes changed/u);
  assert.deepEqual(fs.readFileSync(artifactFile), beforeRejectedRefresh);
});
