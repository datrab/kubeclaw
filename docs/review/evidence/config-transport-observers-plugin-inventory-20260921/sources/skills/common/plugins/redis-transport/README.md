# Redis Transport

Replaceable Redis Streams providers for `transport.publish` and
`telemetry.emit`. The package owns Redis protocol, authentication, stream
trimming, atomic idempotency, bounded network I/O, cancellation, and shutdown.
Domain plugins only see capabilities and never import a Redis client.

Streams use `prefix:v2:publisher:<encoded-target>` or
`prefix:v2:telemetry:<encoded-target>`, where `encoded-target` is
`encodeURIComponent(target)`. This reversible encoding distinguishes dots,
underscores, literal percent escapes and Unicode. Non-well-formed Unicode targets
are rejected. Deduplication keys are scoped to the complete stream and a digest
of the JSON-encoded delivery key, so one provider or target cannot consume another
stream's delivery receipt.

Upgrade writers and consumers together. Pause legacy writers and reconcile their
pending deliveries before switching consumers to v2 names. Historical underscore
names cannot be unambiguously reversed; inspect retained legacy stream records
when necessary. This change does not rename, copy, republish, trim or delete old
streams and does not change the existing configured MAXLEN or dedup TTL policy.
Repository search found this plugin's old-name expectation in its wire test, but
no active consumer lookup using that mapping. The separate OpenClaw host observer
Redis transport is unaffected. Deployment and external consumer migration are not
performed by the code change.

RESP exchanges permit only AUTH and the command reply. Lifetime response bytes
are capped before buffer growth; storage grows geometrically within that cap.
Headers are bounded to 1,024 bytes before CRLF and bulks to 1 MiB. Invalid UTF-8,
framing, lengths, authentication responses and trailing data already buffered with
the command reply fail explicitly. A complete command reply closes the socket;
bytes a peer sends afterward are not inspected.
End, close, timeout, cancellation and parse failure close the socket promptly.
