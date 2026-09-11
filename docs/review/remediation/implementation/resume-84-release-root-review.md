# Root review: immutable Prism release evidence

Reviewed author commit ba84cccf, integrated as f74f1cb. The original release collector and selected-release validator require canonical GHCR/kubeclaw SHA256 references. The original live smoke caller takes the three first-party Prism deployment image strings without converting them to tags. Rejecting `@sha256:` in the signed final validator was therefore a real compatibility defect, not a separate tag-only protocol.

The correction changes only expected/evidence image reference validation. The HMAC canonicalizer, timing-safe signature comparison, repository/issuer/commit checks, clean-run bindings and all required live gates remain byte-equivalent. No live pod or descriptor relationship is inferred. A correctly signed contract fixture is explicitly local validator input, not authenticated GitHub/cluster acceptance evidence.

Root ran the new original-CLI contract tests together with the original release collection/rendering tests. Initial execution had six passes and one `helm ENOENT` failure; after using the already installed original Helm binary via PATH, the exact suite passed **7/7, no skips**. Both outputs are preserved. Canonical changed-file lint passes. The actual `npm run verify:prism:images` entry also passes its original deployment truth check and all five appended contract tests.

The regression is wired into `verify:prism:images` and the existing release-validation command in `update-checks.yaml`. No workflow trigger, permission, action pin or other command changed, and no CI ran. Independently reviewed package changes additionally connect all five already verified Supervisor test files to the existing `test:review-operations` command. These are retained regression gates, not new native acceptance claims.

Raw Root output is under `docs/review/evidence/resume-84-release-root/`. IFR-19-001 still requires actual runtime/OCI identity and active bundle evidence described in the author's protocol-gap report.
