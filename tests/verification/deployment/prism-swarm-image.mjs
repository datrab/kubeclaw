// Runs against the authenticated generation and code actually installed in the image.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function verifyPrismImageConfiguration(capture, role, environment) {
  assert.ok(['prism-control', 'prism-worker', 'prism-studio', 'prism-ingestion'].includes(role), 'explicit image role required');
  const server = '/app/prism/skills/packages/prism-engine/server';
  let actual;
  if (role === 'prism-worker') {
    const { loadWorkerConfig } = await import(`${server}/worker-config.ts`);
    actual = loadWorkerConfig(capture, { ...environment, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://image-proof/control' });
    assert.deepEqual(actual.ingress, Object.fromEntries(Object.entries(capture.components['prism-worker'].settings.ingress).filter(([key]) => !['port', 'shutdownTimeoutMs'].includes(key))));
    assert.equal(actual.port, capture.components['prism-worker'].settings.ingress.port);
    assert.equal(actual.maximumArtifactAcknowledgmentBytes, capture.components['prism-control'].settings.maximumArtifactAcknowledgmentBytes);
  } else if (role === 'prism-control') {
    const { loadControlServerConfig } = await import(`${server}/control-config.ts`);
    actual = loadControlServerConfig(capture, { ...environment, PRISM_SESSION_SECRET: 'image-proof', PRISM_INGRESS_SECRET: 'image-proof', PRISM_INGESTION_SECRET: 'image-proof', PRISM_DISPATCH_SECRET: 'image-proof', PRISM_WORKER_SECRET: 'image-proof' });
    const expected = capture.components['prism-control'].settings;
    for (const key of ['artifactRoot', 'studioPublicUrl', 'port', 'maximumArtifactAcknowledgmentBytes']) assert.equal(actual[key], expected[key]);
    assert.equal(actual.pipelinePreferenceSubject, expected.pipelinePreferenceSubject ?? undefined);
    assert.equal(actual.maximumWorkerResponseBytes, capture.components['prism-execution'].settings.maximumResultBytes);
    assert.equal(actual.nativeWorkerDispatchTimeoutMs, expected.dispatchTimeoutMs);
  } else if (role === 'prism-studio') {
    const { loadStudioConfig } = await import(`${server}/studio-config.ts`);
    actual = loadStudioConfig(capture, environment);
    const expected = capture.components['prism-studio'].settings;
    assert.equal(actual.port, expected.port); assert.equal(actual.controlTimeoutMs, expected.controlTimeoutMs);
    assert.equal(actual.control.href, new URL(expected.controlUrl).href);
  } else {
    const { loadIngestionConfig } = await import(`${server}/ingestion-config.ts`);
    actual = loadIngestionConfig(capture, { ...environment, PRISM_INGESTION_SECRET: 'image-proof' });
    for (const [key, value] of Object.entries(capture.components['prism-control'].settings.ingestionServer)) assert.deepEqual(actual[key], value);
  }
  assert(Object.isFrozen(actual));
  return actual;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const role = process.argv[2];
  assert.ok(['prism-control', 'prism-worker', 'prism-studio', 'prism-ingestion'].includes(role), 'explicit image role required');
  assert.equal(process.getuid?.(), 1000, 'actual image runtime UID1000 must read the root-owned delivery');
  const { verifyPipelineBootReceipt } = await import('/app/prism/skills/packages/plugin-foundation/config/pipeline-boot.mjs');
  const capture = verifyPipelineBootReceipt('/run/pipeline-delivery', role);
  await verifyPrismImageConfiguration(capture, role, process.env);
  console.log('PRISM_SWARM_IMAGE_LOADER_VERIFIED');
}
