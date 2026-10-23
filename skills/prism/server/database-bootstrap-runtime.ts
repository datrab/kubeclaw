import { Pool } from 'pg';
import { bootstrapPrismDatabaseRoles } from './database-roles.ts';
import type { prismDatabaseBootstrapConfig } from '../config/database-bootstrap.ts';

export async function runPrismDatabaseBootstrap(config: ReturnType<typeof prismDatabaseBootstrapConfig>): Promise<void> {
  for (const key of ['connectionTimeoutMs', 'maximumAttempts', 'retryDelayMs'] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] > 2147483647) throw new Error(`PRISM_DATABASE_BOOTSTRAP_SETTING_REQUIRED:${key}`);
  }
  const admin = new Pool({ connectionString: config.adminUrl, connectionTimeoutMillis: config.connectionTimeoutMs });
  const retryableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', '57P03']);

  async function bootstrap(): Promise<void> {
    for (let attempt = 1; attempt <= config.maximumAttempts; attempt += 1) {
      try { await bootstrapPrismDatabaseRoles(admin, config.adminUrl, config.passwords, config.connectionTimeoutMs); return; }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
        if (!retryableCodes.has(code) || attempt === config.maximumAttempts) throw error;
        process.stderr.write(`PostgreSQL is not ready (${code}); retrying bootstrap (${attempt}/${config.maximumAttempts})\n`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
      }
    }
  }
  try { await bootstrap(); } finally { await admin.end(); }
}
