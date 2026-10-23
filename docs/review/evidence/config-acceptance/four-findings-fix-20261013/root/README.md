# Current canonical root integration

The pre-integration root bytes are preserved in the two `.before.gz` files;
`before-identities.json` records their identities. `author/consolidate.py` was
run against the corrected current runtime fragment and native specifications.
No consolidator/checker guard was weakened and no historical report overwritten.

`verification.json` records commands and exit codes; matching stdout/stderr
files contain consolidation, structural and native-conservation checks and the
projection regression run. `check-projection-regressions.py` retains the
existing 16 negative/two positive projection controls, with output redirected
only to this new folder. They check document conservation, not production
behavior. Independent recheck is separate. C0, native and module acceptance
remain unclaimed; C1–C6 are not authorized.
