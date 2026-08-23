CREATE TABLE IF NOT EXISTS prism.worker_request_nonce (
  audience text NOT NULL,
  nonce_digest text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (audience, nonce_digest)
);
CREATE INDEX IF NOT EXISTS worker_request_nonce_expiry_idx
  ON prism.worker_request_nonce(expires_at);
