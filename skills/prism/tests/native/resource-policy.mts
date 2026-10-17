// Test/integration producer snapshot from the selected central author; no copied defaults.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { captureSwarmSettings, type PrismResourcePolicy, type PrismControlSettings, type PrismNonceDatabaseSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';
const entryFile = fileURLToPath(new URL('../../../../config/pipeline.config.json', import.meta.url));
const entry = JSON.parse(readFileSync(entryFile, 'utf8'));
const instanceId = 'kubeclaw/prism/prism-worker';
const capture = captureSwarmSettings(entryFile, {
  role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
  bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
    .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding),
});
export const nativeResourcePolicy = capture.components['prism-execution']!.settings.resourcePolicy as unknown as PrismResourcePolicy;

// Same worker-selected control owner; consumer fixture only, not boot/native admission.
export const nativeControlSettings = capture.components['prism-control']!.settings as unknown as PrismControlSettings;

// Same worker-selected nonce author; no startup admission is implied.
export const nativeNonceDatabaseSettings = capture.components['prism-worker']!.settings.nonceDatabase as unknown as PrismNonceDatabaseSettings;

export const nativeEngineSettings = capture.components['prism-execution']!.settings.enginePolicy as unknown as import('../../../common/plugin-runtime/foundation/config/swarm.ts').PrismEngineSettings;

const studioInstance = 'kubeclaw/prism/prism-studio';
const studioCapture = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-studio', serviceInstanceId: studioInstance,
  bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === studioInstance)
    .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
export const nativeBrowserPolicy = studioCapture.components['prism-studio']!.settings.browserPolicy as unknown as import('../../studio/browser-policy.ts').StudioBrowserPolicy;
