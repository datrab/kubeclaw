# Readiness coauthor LC rebase compatibility check

The two private rebases are compatible with the 35-file Readiness draft and current captured LC baseline. All five declared identities for each file match their actual current/before/original/draft/rebased bytes.

Production is exactly the original BR draft with LC's grouped settings argument retained: the exported factory signature is unchanged, the private helper takes the cohesive settings object, readiness validates `settings.buster.dependencyReadiness` before registry/store composition, admission remains `settings.buster.admission`, and worker-local policy remains `settings.workerLocalRuntime`. The retired runtime JSON decoding is removed exactly as in BR; its presence guard remains supplied by the other unchanged BR staged file.

Removing only the explicit 1000/65536 readiness insertion from the rebased LC test recreates the current LC source byte-for-byte. The extracted evidence helper, its invocation, all assertions and deadlines therefore remain intact. No LC evidence or test body was replaced with the older BR baseline.

The other 33 draft files are outside this two-file overlay and were not changed. At future integration these two overlay files replace only their corresponding draft entries, with fresh baseline comparison. Original staging remains unchanged. This is a BR coauthor source-compatibility check, not independent implementation acceptance, compilation or runtime evidence. No live integration or runtime job occurred.
