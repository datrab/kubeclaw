# WP09 Redis transport — PCR-REDISTRANSPORT-001/002

The stream namespace is now `prefix:v2:<publisher|telemetry>:<percent-encoded-target>`.
Encoding is reversible for admitted well-formed Unicode and distinguishes the
original `pipeline.completed` / `pipeline_completed` collision. Deduplication
identity includes the complete stream, preventing equal delivery keys in separate
target/provider feeds from consuming one another's receipt. The original Lua
atomic publish/dedup operation remains in the actual adapter.

RESP parsing and socket lifetime moved from the adapter into local modules.
A lifetime byte cap of 1,050,630 bytes is checked before response-buffer growth.
The buffer grows geometrically rather than copying its whole prefix for every
fragment. Headers permit at most 1,024 bytes before CRLF (including a split final
CR/LF); bulk bodies retain the existing 1 MiB limit. Numeric lengths, terminators,
UTF-8 and the two-reply AUTH/command exchange are validated. End and close reject
immediately. Error, cancellation, timeout, success and malformed data destroy the
socket; the existing command timeout remains bounded. This is a bounded parser
and original socket test, not an OOM experiment or a production load claim.

## Original implementations and evidence

Redis 7.2.7 was downloaded from its upstream release archive and compiled with
native C tools outside Git, with libc allocation and no TLS build. Tests launch
that actual local redis-server with authentication, read records using its actual
redis-cli, and stop it after each temporary fixture. No Redis emulator, fake SQL,
replacement Lua implementation or external service is used for stream evidence.

`tests/verification/reliability/redis-transport.test.mts` has three cases:

- The original publisher and telemetry adapters, original secret resolver and
  original core effect journal/locks publish both colliding target names. Four
  distinct streams retain their own Unicode payloads, and exact consumer lookup
  resolves all four. Fresh core journals force genuine second adapter sends;
  the original Lua deduplicates each at Redis. Equal delivery keys across the
  four feeds remain independent.
- A local fault-injection TCP peer exercises the original exchange function with
  a fragmented unterminated header, oversized bulk declaration, premature EOF,
  malformed body terminator, invalid UTF-8 and trailing reply in the same
  received buffer. Every case rejects
  and the peer observes socket closure before the configured timeout. This peer
  supplies deliberately invalid wire bytes; it is not claimed as a Redis server.
- Valid byte-fragmented Japanese/emoji data, a maximum-length header split at
  CRLF, and a complete 1 MiB bulk succeed through the same socket path.

Command:

```
REDIS_SERVER=/absolute/path/to/native/redis-server node --test tests/verification/reliability/redis-transport.test.mts
```

All three pass. With the original adapter/inline exchange source supplied through
a read-only Node source-load hook (exchange exported only for test access), the
native test returns `pipeline.completed` payload when reading the logically
separate `pipeline_completed` feed, and the malformed header waits until
`REDIS_TIMEOUT`. Those two cases fail; the valid-response case still passes.
The adapter/inline exchange bytes were loaded from HEAD
`123f0a6e3293fed170e34e10573568aaa87f77d6`, before this Redis source change.

The original Redis package tests and TypeScript build pass. Canonical lint passes
for changed source/tests; no rules or suppressions were changed. The original
wire test expectation was updated to the explicitly versioned names, retaining
its authentication, EVAL, payload and receipt assertions.

## Compatibility and limits

Writers and consumers must cut over together after legacy pending deliveries are
reconciled. Old underscore stream names are ambiguous and are not auto-migrated.
Old streams remain intact; no rename, copy, republish or deletion is performed.
Existing configured stream MAXLEN and dedup TTL behavior is unchanged, as are
Clawdeck collection and the separate OpenClaw observer transport. A repository
consumer/config search found only this plugin's wire-test name expectation, not
an active consumer lookup; this is not a claim about external deployments.
Platform secret policies and log retention are untouched. No deployment, live
operator message, TLS-server integration or production concurrency is claimed.

## Independent review of the frozen Redis scope

The native Redis 7.2.7 regression was rerun: three cases passed, none skipped.
Both original package tests, the package TypeScript build and canonical ESLint
for the four source modules and two changed test files passed. Review confirmed
that admitted target encoding and the complete-stream dedup key keep publisher
and telemetry deliveries distinct, and allocation is capped before growth.
No further source change was necessary. Trailing-data rejection covers bytes
already buffered with the second reply; successful completion destroys the socket
and does not inspect later peer writes. The historical two-failure/one-pass
baseline evidence above was not independently rerun in this review.
