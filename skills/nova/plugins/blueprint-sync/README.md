# Blueprint sync plugin

Synchronizes an explicit set of control files from a validated architecture
Git ref, commits only changed files, persists an append-only outcome, and
writes an immutable summary artifact. Missing declared files request
remediation. Fetch/push and distributed recovery remain separately blocked;
this package never shells out or manipulates Git directly.
