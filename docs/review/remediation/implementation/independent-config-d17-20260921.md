# Independent D17 requirements review — 2026-09-21

Reviewer: bootstrap_guard_fresh_review, not the author of D17 or its acceptance
addendum. Result: the bounded documentation change matches the instructed
configuration ownership and no-fallback requirements. This is no implementation,
migration, test-execution or production acceptance.

D17 and F2a require one clearly assigned component configuration file and one
editable author per setting, including explicitly owned shared settings. F3a
requires explicit desired defaults in those files and rejects missing required
values before activation; code, loaders, schemas, ENV, entrypoints and charts
cannot supply hidden alternatives. Optional features need an explicit contract.
F4a/F5a require actual consumer changes and missing-value/old-author/fallback
negative controls; F-DOCa covers operator instructions, units and migration.
Secrets and software-version authority remain separate and documented.

The new section explicitly replaces the original physical single-swarm-file
requirement while preserving the single-author rule. Removing only this new
addendum makes the current acceptance document exactly equal to the previously
reviewed independent-config-final snapshot (also checked against the earlier
independent-config snapshot). Thus all original F1–F6, F-DOC and A1–A8 bytes are
retained. No material contradiction or omitted requirement was found.

The D01–D16 link label in the dated introductory basis remains intentional
historical context; the separately labeled D17 addition states the new current
requirement. The author confirmed this interpretation.

Evidence: [comparison and exact document hashes](../../evidence/independent-config-d17-20260921/comparison.json).
Exact reviewed document copies are stored beside it as `.snapshot` files.
No live source or runtime setting was modified by this review.
