# Prism phase 6 audit

Status: passed for the approved v1 source classes.

Corpus ingestion now validates source policy before storage. It writes rights, the immutable corpus revision, and the current pointer in one PostgreSQL transaction. Exact retries return the prior revision. Search excludes expired and disallowed items. Public sources reject local and private network targets. The first enabled source classes remain internal projects, user uploads, and generated designs. Public collection still needs source-specific approval.

Proof: `npm run verify:prism:corpus` and the 10,000-row PostgreSQL retrieval proof from phase 0.
