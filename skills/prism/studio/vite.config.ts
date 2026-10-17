import { readFileSync } from 'node:fs';
import { captureSwarmSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { studioBrowserPolicy } from './browser-policy.ts';
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), { name: 'central-development-policy', configureServer(server) {
    const entryFile = fileURLToPath(new URL('../../../config/pipeline.config.json', import.meta.url));
    const entry = JSON.parse(readFileSync(entryFile, 'utf8'));
    const instanceId = 'kubeclaw/prism/prism-studio';
    const capture = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-studio', serviceInstanceId: instanceId,
      bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
        .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
    const policy = studioBrowserPolicy(capture.components['prism-studio']!.settings.browserPolicy);
    server.middlewares.use('/studio-config', (_request, response) => {
      response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store'); response.end(JSON.stringify(policy));
    });
  } }],
  build: { outDir: "../dist-studio", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 4190 },
});
