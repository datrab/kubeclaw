# IFOUR-ROOT-001 — Runtime root body conservation

The fresh independent review verified the four original fixes, then found that
the existing structural checker could accept an altered root history hash while
the registered Runtime fragment remained unchanged. The initial independent
failure and mutant are preserved in `independent-four-findings-recheck-20261013`.

`author/check-matrix.py` now verifies exact normalized Runtime row IDs and full
bodies against the current source fragment, including every original property,
history record and correction provenance. Normalization follows the existing
consolidator's aliases and unconfirmed review state. It does not promote author
data into independent semantic/runtime acceptance. Previous checker bytes are
preserved in `check-matrix-before.py.snapshot`.

`check-controls.py` executes fresh processes against isolated persisted root
inventories. Five negative inputs (history hash corruption, missing correction,
non-provenance status change, row loss, extra row) reject at the Runtime
conservation boundary; two unchanged positives pass. Mutants, stdout/stderr and
command/identity metadata are retained. Real root bytes remain unchanged.

`check-projection-regressions.py` repeats the existing 16 negative/two positive
projection regression controls with logs written only here. Independent
post-fix review is separately recorded under
`independent-four-findings-recheck-20261013/root-guard-recheck/`.
