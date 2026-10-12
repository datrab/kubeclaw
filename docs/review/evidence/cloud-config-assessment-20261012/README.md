# Assessment evidence and OpenClaw handoff

This directory preserves discovery and actual baseline checks at source commit
`4b4684667c2dc27d01583fbec395c94d9f7a0456`. It does not assert complete semantic
C0/F1 acceptance. `source-index.json` hashes productive baseline sources;
`settings-discovery.json` and marker locations are search aids. The collector
is a read-only evidence script, not a production configuration implementation.

`historicalIdentityComparison` records the comparison when the index was
collected, before the later D21/D22 and handoff document edits. In particular
those old document identities must not be asserted unchanged today. Root
`AGENTS.md` was initially added for the first handoff, but has since been removed
because the user disabled AGENTS loading in OpenClaw. The goal document is
self-contained and contains all rules. No AGENTS loader must be enabled.

`verification.json` binds four unchanged raw logs to their baseline checks.
The first component-suite run lacked Helm. The completed Helm 3.18.4 run is
649 tests / 645 passed / 4 failed / 0 skips. It remains failed; four tests reject
old inputs but compare the wrong diagnostic wording. No tests were changed.
Tools and dependency caches are reconstructible and are not committed here.
Lockfile and tool version/archive identity are retained; do not assume a future
agent already has the old local `/workspace/scratch` paths or installed tools.

Current independent handoff review:
[AGENTS-independent goal review](../../remediation/independent-goal-without-agents-20261012.md).
The [earlier review](../../remediation/independent-openclaw-handoff-20261012.md)
is preserved as historical evidence for the first handoff, including its then
existing AGENTS file and document hashes. It does not assert those bytes unchanged
in the later handoff.
Current autonomous task entry:
[OPENCLAW-CONFIG-GOAL.md](../../remediation/OPENCLAW-CONFIG-GOAL.md).

`handoff-manifest.json` records the pre-handoff source base and SHA256 identities
of all current edited/new handoff documents and evidence files except itself.
Its enclosing Git commit supplies the manifest's own immutable identity; a
self-referential file hash is deliberately not invented. Runtime sources/tests
are unchanged from the stated base; this is documentation/evidence publication.

The first handoff's manifest and validation are preserved unmodified as
`handoff-manifest-a67d9a25.json` and `handoff-validation-a67d9a25.json`.
Their file hashes refer to commit `a67d9a25c11e6c396c1372f4cca5534f0625117a`;
verify them against `git show <that-commit>:<path>`, not against current files.
The current manifest records the AGENTS deletion and the self-contained goal.

Verify every manifest item from the repository root before resuming:

```python
import hashlib, json, pathlib
root = pathlib.Path.cwd()
manifest = json.loads((root / 'docs/review/evidence/cloud-config-assessment-20261012/handoff-manifest.json').read_text())
for entry in manifest['files']:
    assert hashlib.sha256((root / entry['path']).read_bytes()).hexdigest() == entry['sha256'], entry['path']
```

For C0, independently enumerate current sources/consumers and recollect new
identities. Do not transform this snapshot into current coverage by merely
changing its commit field, hiding failures or trusting source-marker counts.
