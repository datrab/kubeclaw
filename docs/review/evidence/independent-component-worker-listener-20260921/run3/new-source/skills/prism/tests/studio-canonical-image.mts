import { readTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import test from 'node:test';
import {studio} from './fixtures/studio-service.mts';

test('canonical authored Studio profile starts the actual packaged service contract', async t => {
  const authored = readTestBundle(process.env.SWARM_CONFIG ?? new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
  const settings = authored['prism-studio'].settings;
  const app = await studio(t, settings.controlUrl, settings.controlTimeoutMs, settings.port);
  await app.healthy();
});
