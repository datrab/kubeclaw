import { verifyPipelineBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { loadAgentBridgeConfig } from './agent-bridge-config.ts';
import { startAgentBridge } from './agent-bridge.mjs';

const config = loadAgentBridgeConfig(verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-agent-bridge'));
const bridge = await startAgentBridge(config);
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
  void bridge.close().catch(error => { console.error('Prism agent shutdown:', error); process.exitCode = 1; });
});
