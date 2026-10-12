// Test/integration producer snapshot from the original author loader; no copied defaults.
import { fileURLToPath } from 'node:url';
import { loadPrismSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';
export const nativeResourcePolicy = loadPrismSettings({ SWARM_CONFIG:
  fileURLToPath(new URL('../../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url)) }).native.resourcePolicy;
