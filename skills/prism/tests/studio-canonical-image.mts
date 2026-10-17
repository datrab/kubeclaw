import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {studio} from './fixtures/studio-service.mts';

test('canonical authored Studio profile starts the actual packaged service contract', async t => {
  // Use the sole central author and its explicit receiving binding, never the
  // retired chart-local bundle, environment author, or an assumed profile.
  const author = process.env.PRISM_STUDIO_IMAGE_PROOF ? new URL(`file://${process.env.PRISM_STUDIO_IMAGE_PROOF}/canonical/author/`) : new URL('../../../config/', import.meta.url);
  const entry = JSON.parse(fs.readFileSync(new URL('pipeline.config.json', author), 'utf8'));
  const bindings = entry.bindings.filter((binding: { role: string; owner: string; profileId: string }) => binding.role === 'prism' && binding.owner === 'prism-studio');
  assert.equal(bindings.length, 1, 'canonical Studio must have one explicit receiving binding');
  const component = JSON.parse(fs.readFileSync(new URL(entry.components['prism-studio'], author), 'utf8'));
  const settings = component.profiles[bindings[0].profileId].settings;
  const app = await studio(t, settings.controlUrl, settings.controlTimeoutMs, settings.port);
  await app.healthy();
});
