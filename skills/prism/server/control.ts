import { Pool } from "pg";
import { createControlServer } from "./control-server.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const server = createControlServer(pool);
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
process.on("SIGTERM", () => server.close(() => pool.end()));
