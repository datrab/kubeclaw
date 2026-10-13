import { Client, type Pool, type PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';

export interface PrismRolePasswords { migrator: string; runtime: string; readonly: string }
const roles = ['migrator', 'runtime', 'readonly'] as const;
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;

async function authenticationCode(adminUrl: string, role: string, password: string): Promise<string | null> {
  const url = new URL(adminUrl); url.username = role; url.password = password;
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try { await client.connect(); return null; }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error) return String(error.code);
    throw new Error('PRISM_ROLE_AUTHENTICATION_UNAVAILABLE');
  } finally { await client.end(); }
}

async function verifyCredential(adminUrl: string, role: string, password: string): Promise<void> {
  // A successful connection under trust/peer/certificate-only authentication
  // cannot prove that the supplied password matches the existing role.
  const wrong = await authenticationCode(adminUrl, role, randomBytes(48).toString('base64url'));
  if (wrong !== '28P01') throw new Error(`PRISM_ROLE_PASSWORD_AUTH_REQUIRED:${role}`);
  if (await authenticationCode(adminUrl, role, password) !== null) throw new Error(`PRISM_ROLE_CREDENTIAL_TRANSITION_REQUIRED:${role}`);
}

/** Bootstrap is additive and transactional; normal upgrades never rotate credentials. */
export async function bootstrapPrismDatabaseRoles(pool: Pool, adminUrl: string, passwords: PrismRolePasswords): Promise<void> {
  if (roles.some(role => !passwords[role])) throw new Error('PRISM_ROLE_PASSWORD_REQUIRED');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('prism-role-bootstrap',0))");
      const existing = new Set((await client.query<{ rolname: string }>(
        "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [roles.map(role => `prism_${role}`)])).rows.map(row => row.rolname));
      await ensureRoles(client, adminUrl, passwords, existing);
      await grantPrismRoles(client);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  } finally { client.release(); }
}

async function ensureRoles(client: PoolClient, adminUrl: string, passwords: PrismRolePasswords, existing: ReadonlySet<string>): Promise<void> {
  for (const role of roles) if (existing.has(`prism_${role}`)) await verifyCredential(adminUrl, `prism_${role}`, passwords[role]);
  for (const role of roles) if (!existing.has(`prism_${role}`)) await client.query(`CREATE ROLE prism_${role} LOGIN PASSWORD ${literal(passwords[role])}`);
}

async function grantPrismRoles(client: PoolClient): Promise<void> {
  await client.query('GRANT CONNECT ON DATABASE prism TO prism_migrator, prism_runtime, prism_readonly');
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  await client.query('CREATE SCHEMA IF NOT EXISTS prism AUTHORIZATION prism_migrator');
  await client.query('ALTER SCHEMA prism OWNER TO prism_migrator');
  await client.query('GRANT USAGE ON SCHEMA prism TO prism_runtime, prism_readonly');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA prism TO prism_runtime');
  await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA prism TO prism_readonly');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE prism_migrator IN SCHEMA prism GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prism_runtime');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE prism_migrator IN SCHEMA prism GRANT SELECT ON TABLES TO prism_readonly');
}
