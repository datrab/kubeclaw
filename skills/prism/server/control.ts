import { Pool } from "pg";
import { createConfiguredControlServer } from "./control-server.ts";
import { loadControlCompositionConfig } from "./control-config.ts";
import { verifyPipelineBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

const capture = verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-control');
const composition = await loadControlCompositionConfig(capture);
const config = composition.listener;
const pool = new Pool({ connectionString: config.databaseUrl });
const server = createConfiguredControlServer(pool, composition);
server.listen(config.port, "0.0.0.0");
process.on("SIGTERM", () => server.close(() => { void pool.end(); }));
