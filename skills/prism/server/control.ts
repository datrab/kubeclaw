import { Pool } from "pg";
import { createControlServer } from "./control-server.ts";
import { loadControlListenerConfig } from "./control-config.ts";

const config = loadControlListenerConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const server = await createControlServer(pool);
server.listen(config.port, "0.0.0.0");
process.on("SIGTERM", () => server.close(() => { void pool.end(); }));
