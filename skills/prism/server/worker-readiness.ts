import type { PrismNonceDatabaseSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { Pool } from "pg";
import { PostgresNonceStore, verifyInternalRequest } from "./internal-auth.ts";

export class WorkerDependencyUnavailable extends Error {
  constructor() { super("PRISM_NONCE_DATABASE_UNAVAILABLE"); }
}

export async function checkWorkerNonceTable(db: { query(sql: string): Promise<unknown> }): Promise<void> {
  await db.query("SELECT 1 FROM prism.worker_request_nonce LIMIT 1");
}

export interface WorkerDependencyDiagnostic {
  event: "prism_nonce_dependency_failure";
  phase: "admission" | "connect" | "query" | "idle" | "cancel";
  code: string;
  durationMs: number;
  active: number;
  open: number;
  pending: number;
}

function safeDatabaseCode(error: unknown): string {
  if (!(error instanceof Error)) return "PG_UNKNOWN";
  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && (/^[0-9A-Z]{5}$/u.test(code)
    || ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN", "EPIPE"].includes(code))) return code;
  if (error.message === "Connection terminated due to connection timeout"
    || error.message === "timeout exceeded when trying to connect") return "PG_CONNECT_TIMEOUT";
  return "PG_UNKNOWN";
}

/** Native pool acquisition removes timed-out waiters; SQL has both a server
 * deadline and a connection shutdown deadline. No timed-out SQL is detached.
 * The admission cap equals max, and the pool is private: no timed-out queued
 * borrower can leave a replacement connection starting after its rejection. */
export class WorkerNonceDatabase {
  private readonly pool: Pool;
  private active = 0;
  private readonly authenticationWindowMs: number;
  private readonly maximumCleanupRows: number;
  private readonly timeoutMs: number;
  private readonly maximumConnections: number;
  private readonly diagnostic: (event: WorkerDependencyDiagnostic) => void;
  constructor(connectionString: string, settings: PrismNonceDatabaseSettings, diagnostic: (event: WorkerDependencyDiagnostic) => void = event => { process.stderr.write(`${JSON.stringify(event)}\n`); }) {
    const { timeoutMs, maximumConnections } = settings;
    this.diagnostic = diagnostic;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new Error("Invalid nonce dependency deadline");
    if (!Number.isSafeInteger(maximumConnections) || maximumConnections < 1 || maximumConnections > 2_147_483_647) throw new Error("Invalid nonce database connection limit");
    if (!Number.isSafeInteger(settings.maximumCleanupRows) || settings.maximumCleanupRows < 1 || settings.maximumCleanupRows > 2147483647) throw new Error("Invalid nonce cleanup row limit");
    if (!Number.isSafeInteger(settings.authenticationWindowMs) || settings.authenticationWindowMs < 1 || settings.authenticationWindowMs > 2147483647) throw new Error("Invalid authentication window");
    if (!Number.isSafeInteger(settings.idleTimeoutMs) || settings.idleTimeoutMs < 0 || settings.idleTimeoutMs > 2147483647) throw new Error("Invalid nonce database idle timeout");
    this.authenticationWindowMs = settings.authenticationWindowMs;
    this.maximumCleanupRows = settings.maximumCleanupRows;
    this.timeoutMs = timeoutMs;
    this.maximumConnections = maximumConnections;
    this.pool = new Pool({ connectionString, max: maximumConnections,
      connectionTimeoutMillis: timeoutMs, idleTimeoutMillis: settings.idleTimeoutMs, statement_timeout: timeoutMs,
      lock_timeout: timeoutMs });
    // Idle connection failures are handled by pg's pool eviction. Never log
    // connection details or credentials in a public readiness response.
    this.pool.on("error", error => this.report("idle", safeDatabaseCode(error), performance.now()));
  }

  private report(phase: WorkerDependencyDiagnostic["phase"], code: string, started: number): void {
    this.diagnostic({ event: "prism_nonce_dependency_failure", phase, code,
      durationMs: Math.max(0, Math.round(performance.now() - started)), active: this.active,
      open: this.pool.totalCount, pending: this.pool.waitingCount });
  }

  private async run(operation: (db: PostgresNonceStore) => Promise<void>, signal?: AbortSignal): Promise<void> {
    const started = performance.now();
    if (this.active >= this.maximumConnections) {
      this.report("admission", "ADMISSION_LIMIT", started);
      throw new WorkerDependencyUnavailable();
    }
    this.active++;
    try {
      const client = await this.pool.connect().catch((error: unknown) => {
        this.report("connect", safeDatabaseCode(error), started);
        throw new WorkerDependencyUnavailable();
      });
      let closing: Promise<void> | undefined;
      const stop = () => {
        this.report("cancel", signal?.aborted ? "REQUEST_CANCELLED" : "DEPENDENCY_DEADLINE", started);
        closing ??= client.end();
        client.connection.stream.destroy();
      };
      const timer = setTimeout(stop, this.timeoutMs);
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
      const query = async (sql: string, params?: unknown[]) => {
        try { return await client.query(sql, params); }
        catch (error) {
          this.report("query", safeDatabaseCode(error), started);
          throw new WorkerDependencyUnavailable();
        }
      };
      try {
        if (closing) throw new WorkerDependencyUnavailable();
        await checkWorkerNonceTable({ query });
        await operation(new PostgresNonceStore({ query }, this.maximumCleanupRows));
        if (closing) throw new WorkerDependencyUnavailable();
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        await Promise.resolve(closing).finally(() => client.release(Boolean(closing)));
      }
    } finally { this.active--; }
  }

  check(signal?: AbortSignal): Promise<void> { return this.run(async () => {}, signal); }
  authenticate(secret: string, body: Buffer, headers: Record<string, string | string[] | undefined>, signal?: AbortSignal): Promise<void> {
    return this.run((store) => verifyInternalRequest(secret, body, headers, store, this.authenticationWindowMs), signal);
  }
  get pendingConnections(): number { return this.pool.waitingCount; }
  get openConnections(): number { return this.pool.totalCount; }
  close(): Promise<void> { return this.pool.end(); }
}
