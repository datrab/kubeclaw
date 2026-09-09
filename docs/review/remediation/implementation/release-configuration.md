# Release configuration source binding

IFR-23-001: materialization now checks the preserved image receipt's source
commit against the actual deployment configuration before creating or updating
generated values. Runtime covers both consumed charts, including bundled chart
files, and all four role value files. Ops covers its own chart; its generated
overlay contains selected image references only. The two families remain
independent.

The check requires the repository root and the referenced Git commit, regular
source files, identical file sets, and raw Git blob hashes matching current
bytes. Added/deleted files, symlinks and changed chart/value bytes fail explicitly.
Later unrelated commits are permitted when these configuration bytes are
unchanged. No compatibility adapter, unchecked migration exception, automatic
checkout, or network fallback is introduced. Both generation and `--check` use
this boundary. Existing successful-workflow/receipt verification still supplies
image provenance; this helper alone does not authenticate a fabricated receipt.

Promotion and update-policy checkouts retain full Git history so a previous
successful main build can be compared. A changed configuration requires selecting
a successful build from that configuration. Generated output identifies the
source commit. The sidecar binding loop was extracted without behavior changes
to keep the materializer within canonical nesting limits.

Verification: five original Git/Helm tests pass, independently repeated. They
exercise receipt validation, actual materialization and `--check`, all four role
charts and ops, unrelated later commits, incompatible newer chart/value data,
file additions/deletions, symlinks, unavailable commits, and family isolation.
Rendering identifiers are explicitly fixture digests, never claimed as built
or pullable images. Canonical ESLint passes for all four changed/new JavaScript
files; workflow YAML parses. No CI, image build, promotion workflow or deployment
was requested or executed.

The source-binding defect is locally verified. This does not prove schema/data
migration compatibility, a successful real image startup, or arbitrary later
operator overrides. Those acceptance gates remain separate. IFR-19-001 tracks
binding actual deployment entrypoints to the selected release.
