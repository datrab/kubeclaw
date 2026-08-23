import { Pool } from "pg";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const admin = new Pool({ connectionString: required("ADMIN_DATABASE_URL") });
try {
  for (const [role, passwordName] of [
    ["prism_migrator", "PRISM_MIGRATOR_PASSWORD"],
    ["prism_runtime", "PRISM_RUNTIME_PASSWORD"],
    ["prism_readonly", "PRISM_READONLY_PASSWORD"],
  ] as const) {
    const password = required(passwordName);
    const exists = await admin.query<{ exists: boolean }>("SELECT EXISTS(SELECT FROM pg_roles WHERE rolname=$1) AS exists", [role]);
    if (!exists.rows[0]?.exists) await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD ${literal(password)}`);
    else await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD ${literal(password)}`);
  }
  await admin.query("GRANT CONNECT ON DATABASE prism TO prism_migrator, prism_runtime, prism_readonly");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query("CREATE SCHEMA IF NOT EXISTS prism AUTHORIZATION prism_migrator");
  await admin.query("ALTER SCHEMA prism OWNER TO prism_migrator");
} finally {
  await admin.end();
}
