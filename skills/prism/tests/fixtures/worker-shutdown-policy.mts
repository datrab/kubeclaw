/** Complete current authors for the original native process producer.
 * This is not a boot receipt: the isolated native guest must publish and install
 * the selected generation before executing the original process assertions.
 */
import path from 'node:path';
import { readTestPipeline, writeTestPipeline } from '../../../../tests/fixtures/config/pipeline-components.mjs';

export function writeWorkerShutdownPolicy(root: string, shutdownTimeoutMs: number,
  port: number, closeTimeoutMs: number, drainTimeoutMs: number): string {
  const documents = readTestPipeline();
  const binding = documents.entry.bindings.find((row: {owner: string; instanceId: string}) =>
    row.owner === 'prism-worker' && row.instanceId === 'kubeclaw/prism/prism-worker');
  if (!binding) throw new Error('NATIVE_SHUTDOWN_WORKER_BINDING_REQUIRED');
  const settings = documents['prism-worker'].profiles[binding.profileId].settings;
  settings.ingress.shutdownTimeoutMs = shutdownTimeoutMs;
  settings.ingress.port = port;
  settings.supervisor.closeTimeoutMs = closeTimeoutMs;
  settings.supervisor.drainTimeoutMs = drainTimeoutMs;
  const file = path.join(root, 'pipeline.config.json');
  writeTestPipeline(file, documents);
  return file;
}
