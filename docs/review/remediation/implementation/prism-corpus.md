# Prism corpus transaction ownership — PCR-PRISM-CORPUS-001

Status: source fix implemented; real pool verification blocked, so this finding is not fully verified.

`ingest()` now uses the existing `storage.inTransaction()` owner. A pool reserves one connection, and the digest advisory lock, prior-revision lookup, rights/item/revision/embedding writes, commit or rollback all use that connection. The transaction lock serializes identical input digests before lookup. Hash collisions only serialize unrelated inputs; revision identity still uses the complete original SHA-256 digest. Existing ingestion content, rights, activation, and embedding semantics are preserved. This does not add embedding provenance or rights-expiry guarantees.

Storage changes consist only of exporting the already-existing `Database` type. The write block is a private `insertRevision()` helper receiving the reserved `Queryable`; it never borrows another connection. The existing transaction helper releases its reserved connection in `finally`.

## Current verification

- `node --test skills/prism/tests/corpus.test.mts`: all four original PGlite tests pass, including ingestion/search/idempotency/rights, unsafe public networks, restricted retrieval, and ranking filters. These are single-connection semantics, not pool evidence.
- `npm run typecheck --prefix skills/prism`: passes.
- Canonical ESLint finds no new ingest/helper/test violation. It still reports three unchanged `search()` issues: function length, complexity, and fallback chain. No lint rule or baseline was weakened.
- Scoped diff whitespace checks pass.

`skills/prism/tests/corpus-pool.test.mts` is a NOT-RUN native PostgreSQL regression. It creates a private temporary database, runs the original migrations and genuine vector extension, then uses an actual pg.Pool with two verified backend PIDs. SQL advisory-lock barriers queue competing requests while ingestion is mid-write; native SQL triggers inject failures after each insert and after the item update. Assertions require no partial table rows and no idle-in-transaction connection. Twelve concurrent identical ingestions must produce one revision. The test does not replace SQL, the pool, vector, or schema with a mock. Use only a dedicated local server:

```
PRISM_TEST_PG_URL=postgresql://postgres@127.0.0.1:<temporary-port>/postgres node skills/prism/tests/corpus-pool.test.mts
```

The optional `PRISM_CORPUS_MODULE` absolute path allows the same regression to load a preserved pre-fix source module. No before/after pool result is claimed: neither version could be run here.

## Concrete native-server blocker

Native PostgreSQL 17.5 and pgvector 0.8.0 were built from their exact upstream source releases and installed outside Git. Native `postgres --version` reports 17.5; vector compiled against those installed server headers. Tool provisioning also used native Bison 3.8.2, Flex 2.6.4, and m4 1.4.19 packages extracted outside Git, without system installation. The initially obtained embedded-postgres binary package was not used as the final server build.

The environment exposes only UID/GID mapping `0 0 1`. `initdb` rejects root; `chown` to nobody fails with EINVAL, `runuser` cannot set groups (EPERM), and legitimate user-namespace mapping fails writing uid_map (EPERM). No PostgreSQL identity guard, libc call, user identity, extension, or pool was patched or replaced. No server started and no external database/migration was touched. A real non-root execution environment is required for the pending two-connection proof.
