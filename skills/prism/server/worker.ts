import { PrismEngine, DeterministicDesignProvider } from "../engine/index.ts";
import { WorkerArtifactClient } from "./worker-artifacts.ts";
import { WorkerNonceDatabase } from "./worker-readiness.ts";
import { createWorkerServer } from "./worker-service.ts";
import { loadWorkerConfig } from "./worker-config.ts";
const config = loadWorkerConfig();
// The worker is intentionally model-free. OpenClaw is the sole owner of LLM
// calls; this deterministic provider only supports bounded render/evaluation
// operations and cannot reach OpenAI, LiteLLM, or any other model endpoint.
const engine = new PrismEngine(new DeterministicDesignProvider());
const artifactClient = new WorkerArtifactClient(config.controlInternalUrl, config.workerSecret, config.spiffeEnabled);
const server = createWorkerServer(config.spiffeEnabled
  ? { mode: "spiffe", trustedControlSpiffeId: config.trustedControlSpiffeId }
  : { mode: "hmac", secret: config.workerSecret, database: new WorkerNonceDatabase(config.databaseUrl) }, engine, artifactClient);
function installShutdown(): void {
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  void server.shutdown(config.shutdownTimeoutMs).then(() => {
    process.stderr.write('{"event":"prism_worker_shutdown","state":"requests_drained"}\n');
  }, () => {
    // A forced process cutoff does not prove that external/browser work stopped.
    process.stderr.write('{"event":"prism_worker_shutdown","state":"unresolved"}\n');
    process.exit(1);
  });
});
}
installShutdown();
server.listen(config.port, "0.0.0.0");
