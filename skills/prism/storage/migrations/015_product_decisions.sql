-- Independent product authority audit survives DemoLease / namespace cleanup.
CREATE TABLE prism.product_decision (
  decision_id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  intent_digest text NOT NULL,
  intent jsonb NOT NULL,
  payload_digest text NOT NULL,
  envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE prism.product_decision_receipt (
  decision_id uuid PRIMARY KEY REFERENCES prism.product_decision(decision_id),
  receipt jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT, INSERT ON prism.product_decision, prism.product_decision_receipt TO prism_runtime;
GRANT SELECT ON prism.product_decision, prism.product_decision_receipt TO prism_readonly;
