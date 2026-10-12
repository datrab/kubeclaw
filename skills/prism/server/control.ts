import { Pool } from "pg";
import { createConfiguredControlServer } from "./control-server.ts";
import { loadControlCompositionConfig } from "./control-config.ts";

const composition = await loadControlCompositionConfig();
const config = composition.listener;
const pool = new Pool({ connectionString: config.databaseUrl });
const server = createConfiguredControlServer(pool, composition);
server.listen(config.port, "0.0.0.0");
process.on("SIGTERM", () => server.close(() => { void pool.end(); }));
