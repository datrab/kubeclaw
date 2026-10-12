import fs from 'node:fs';
import test from 'node:test';
import {studio} from './fixtures/studio-service.mts';

test('canonical authored Studio profile starts the actual packaged service contract', async t => {
  const authored = JSON.parse(fs.readFileSync(process.env.SWARM_CONFIG ?? new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url), 'utf8'));
  const settings = authored.operator.prism.studio;
  const app = await studio(t, settings.controlUrl, settings.controlTimeoutMs, settings.port);
  await app.healthy();
});
