import { Pool } from "pg";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const admin = new Pool({
  connectionString: required("ADMIN_DATABASE_URL"),
  connectionTimeoutMillis: 5_000,
});
const retryableCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "57P03",
]);
const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const bootstrap = async (): Promise<void> => {
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
};

try {
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await bootstrap();
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "UNKNOWN";
      if (!retryableCodes.has(code) || attempt === maxAttempts) throw error;
      console.warn(`PostgreSQL is not ready (${code}); retrying bootstrap (${attempt}/${maxAttempts})`);
      await sleep(2_000);
    }
  }
} finally {
  await admin.end();
}
