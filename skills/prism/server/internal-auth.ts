import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function signInternalRequest(
  secret: string,
  body: Buffer,
  timestamp: number,
  nonce: string,
): string {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${digest}`)
    .digest("hex");
}

export type NonceStore = {
  consume(
    audience: string,
    nonceDigest: string,
    issuedAt: Date,
    expiresAt: Date,
  ): Promise<boolean>;
};

export class PostgresNonceStore implements NonceStore {
  private readonly db: {
    query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  };
  private readonly maximumCleanupRows: number;
  constructor(db: {
    query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  }, maximumCleanupRows: number) {
    if (!Number.isSafeInteger(maximumCleanupRows) || maximumCleanupRows < 1 || maximumCleanupRows > 2147483647) throw new Error("Invalid nonce cleanup row limit");
    this.maximumCleanupRows = maximumCleanupRows;
    this.db = db;
  }
  async consume(
    audience: string,
    nonceDigest: string,
    issuedAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    await this.db.query(
      "DELETE FROM prism.worker_request_nonce WHERE ctid IN (SELECT ctid FROM prism.worker_request_nonce WHERE expires_at <= now() ORDER BY expires_at LIMIT $1)",
      [this.maximumCleanupRows],
    );
    const result = await this.db.query(
      "INSERT INTO prism.worker_request_nonce(audience,nonce_digest,issued_at,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING nonce_digest",
      [audience, nonceDigest, issuedAt, expiresAt],
    );
    return result.rows.length === 1;
  }
}

export async function verifyInternalRequest(
  secret: string,
  body: Buffer,
  headers: Record<string, string | string[] | undefined>,
  nonceStore: NonceStore,
  authenticationWindowMs: number,
  audience = "prism-worker",
  now = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(authenticationWindowMs) || authenticationWindowMs < 1 || authenticationWindowMs > 2147483647) throw new Error("Invalid authentication window");
  const timestamp = Number(String(headers["x-prism-timestamp"] ?? ""));
  const nonce = String(headers["x-prism-nonce"] ?? "");
  const supplied = String(headers["x-prism-signature"] ?? "").replace(
    /^v1=/u,
    "",
  );
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > authenticationWindowMs)
    throw new Error("internal request expired");
  if (!/^[a-f0-9]{32}$/u.test(nonce) || !/^[a-f0-9]{64}$/u.test(supplied))
    throw new Error("invalid internal request authentication");
  const expected = Buffer.from(
    signInternalRequest(secret, body, timestamp, nonce),
    "hex",
  );
  const actual = Buffer.from(supplied, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("invalid internal request authentication");
  const nonceDigest = createHash("sha256").update(nonce).digest("hex");
  if (
    !(await nonceStore.consume(
      audience,
      nonceDigest,
      new Date(timestamp),
      new Date(timestamp + authenticationWindowMs),
    ))
  )
    throw new Error("internal request replayed");
}
