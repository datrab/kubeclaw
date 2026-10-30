import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { runtimePublicationCommand, isRuntimeRenderConfiguration, assertRuntimePublicationScope } from '../../../scripts/updates/runtime-publication-scope.mjs';
const images = JSON.parse(fs.readFileSync('releases/runtime-images.json'));
const code = JSON.parse(fs.readFileSync('releases/runtime-code.json'));
const prior = { ...images, code };

test('only Buster runtime/code changes select guarded Buster export', () => {
  const next = structuredClone(prior);
  next.images['buster-runtime'] = 'new-runtime';
  next.images['buster-gateway'] = 'new-gateway';
  next.code.bundles.buster.sha256 = 'new-bundle';
  assert.equal(runtimePublicationCommand(prior, next, true), 'export-buster');
  assert.equal(runtimePublicationCommand(prior, next, false), 'export');
  assert.equal(runtimePublicationCommand(undefined, next, true), 'export');
});

test('unrelated image/code/provenance changes retain full publication', () => {
  for (const name of Object.keys(prior.images).filter(name => !['buster-gateway', 'buster-runtime', 'namespace-controller'].includes(name))) {
    const next = structuredClone(prior);
    next.images[name] = 'changed';
    assert.equal(runtimePublicationCommand(prior, next, true), 'export');
    const provenance = structuredClone(prior);
    provenance.imageSources[name].commit = 'a'.repeat(40);
    assert.equal(runtimePublicationCommand(prior, provenance, true), 'export');
  }
  for (const role of ['nova', 'prism']) {
    const next = structuredClone(prior);
    next.code.bundles[role].sha256 = 'changed';
    assert.equal(runtimePublicationCommand(prior, next, true), 'export');
    const provenance = structuredClone(prior);
    delete provenance.code.bundles[role].source;
    assert.equal(runtimePublicationCommand(prior, provenance, true), 'export');
  }
});

test('all role chart/value changes force full rendering, exporter-only code does not', () => {
  for (const file of ['charts/kubeclaw/templates/deployment.yaml', 'charts/prism/values.yaml',
    'my-values/nova-values.yaml', 'my-values/buster-values.yaml', 'gitops/production/config.json', 'gitops/production/overlays/prism.yaml']) {
    assert.equal(isRuntimeRenderConfiguration(file), true, file);
  }
  for (const file of ['scripts/gitops-buster-scope.mjs', '.github/workflows/auto-promote-runtime.yaml',
    'skills/buster/core/full-stack-runtime.ts', 'releases/runtime-images.json']) assert.equal(isRuntimeRenderConfiguration(file), false, file);
});

test('automatic publication consumes only validated selector export commands', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/auto-promote-runtime.yaml', 'utf8'));
  const step = workflow.jobs.publish.steps.at(-1);
  assert.equal(step.env.EXPORT_COMMAND, '${{ steps.selection.outputs.export_command }}');
  assert.match(step.run, /case "\$EXPORT_COMMAND" in export\|export-buster\)/);
  assert.match(step.run, /gitops-continuous\.mjs "\$EXPORT_COMMAND" "\$BUNDLE_DIRECTORY"/);
});

test('runtime and namespace-controller changes both remain Buster-only, unrelated slots still refuse', () => {
  const next = structuredClone(prior);
  next.images['buster-runtime'] = 'new-runtime';
  next.images['buster-gateway'] = 'new-gateway';
  next.images['namespace-controller'] = 'new-controller';
  next.imageSources['namespace-controller'].commit = 'b'.repeat(40);
  assert.equal(runtimePublicationCommand(prior, next, true), 'export-buster');
  assert.equal(runtimePublicationCommand(prior, next, false), 'export');
});

test('Buster authorization refuses full export, including shared-image rebuild fallback', () => {
  const next = structuredClone(prior);
  next.images['prism-agent'] = 'shared-input-rebuild';
  const command = runtimePublicationCommand(prior, next, true);
  assert.equal(command, 'export');
  assert.throws(() => assertRuntimePublicationScope(command, 'buster'), /SCOPE_EXCEEDED/);
  assert.doesNotThrow(() => assertRuntimePublicationScope('export-buster', 'buster'));
  assert.doesNotThrow(() => assertRuntimePublicationScope('export', 'all'));
  for (const scope of [undefined, '', 'prism']) assert.throws(() => assertRuntimePublicationScope('export', scope), /SCOPE_REQUIRED/);
  assert.throws(() => assertRuntimePublicationScope('untrusted', 'all'), /COMMAND_INVALID/);
});

test('automatic selector checks authorization before changing selected receipts', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/auto-promote-runtime.yaml', 'utf8'));
  assert.equal(workflow.jobs.publish.env.RUNTIME_PUBLICATION_SCOPE, 'all');
  const next = structuredClone(prior);
  next.images['prism-studio'] = 'new-prism-editor';
  next.code.bundles.prism.sha256 = 'new-prism-bundle';
  const command = runtimePublicationCommand(prior, next, true);
  assert.equal(command, 'export');
  assert.doesNotThrow(() => assertRuntimePublicationScope(command, workflow.jobs.publish.env.RUNTIME_PUBLICATION_SCOPE));
  const publish = workflow.jobs.publish.steps.at(-1);
  assert.equal(workflow.jobs.publish.permissions.packages, 'read');
  assert.ok(publish.env.TRIVY_PASSWORD);
  assert.ok(publish.run.indexOf('scan-runtime-images.sh') > publish.run.indexOf('materialize-release'));
  assert.ok(publish.run.indexOf('scan-runtime-images.sh') < publish.run.indexOf('git commit'));
  const source = fs.readFileSync('scripts/updates/select-runtime-deployment.mjs', 'utf8');
  assert.ok(source.indexOf('assertRuntimePublicationScope(exportCommand,') < source.indexOf("fs.mkdirSync('releases'"));
});
