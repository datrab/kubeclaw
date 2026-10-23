import { Pool } from 'pg';
import { bootstrapPrismDatabaseRoles } from './database-roles.ts';
import { prismDatabaseBootstrapConfig } from '../config/database-bootstrap.ts';

const config = prismDatabaseBootstrapConfig();
const admin = new Pool({ connectionString: config.adminUrl, connectionTimeoutMillis: config.connectionTimeoutMs });
const retryableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', '57P03']);

async function bootstrap(): Promise<void> {
  for (let attempt = 1; attempt <= config.maximumAttempts; attempt += 1) {
    try { await bootstrapPrismDatabaseRoles(admin, config.adminUrl, config.passwords); return; }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
      if (!retryableCodes.has(code) || attempt === config.maximumAttempts) throw error;
      process.stderr.write(`PostgreSQL is not ready (${code}); retrying bootstrap (${attempt}/${config.maximumAttempts})\n`);
      await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
    }
  }
}
try { await bootstrap(); } finally { await admin.end(); }
