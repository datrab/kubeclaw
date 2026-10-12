import fs from 'node:fs';

/** Explicit selected component policy for original direct-consumer tests; no missing-field repair. */
export const scannerTestPolicy = JSON.parse(fs.readFileSync(
  new URL('../../../charts/kubeclaw/files/config/buster-engine.config.json', import.meta.url), 'utf8')).settings.securityScan;
