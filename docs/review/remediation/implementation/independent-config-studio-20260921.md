# Independent Studio cutover review — in progress

This review is not an acceptance of the Studio migration or CONFIG. The reviewer
did not implement the Studio changes. The preimplementation contract remains
[CS01–CS08 and CS-DOC](config-studio-20260921.md), including original service tests,
Helm delivery and distinct actual built-image evidence.

## Confirmed origin-validation defect

A real call to `loadStudioConfig`, using a complete canonical document with only
the Studio endpoint changed, accepted `http://control\suffix`. WHATWG URL parsing
normalized that input to `http://control/suffix` with pathname `/suffix`. This
contradicts the declared origin-only contract: the existing proxy replaces the
path, so the configured prefix is misleading. The ordinary
`http://control:8080/` positive control also passed. The
[initial observations](../../evidence/config-studio-independent-20260921/url-probe-initial.json)
are retained; this was a source-loader probe, not a network or image execution.

The cause is relying on a permissive raw-string pattern plus successful URL
construction rather than checking the parsed protocol, credentials, pathname,
query and fragment. The author corrected that boundary and added regression
cases. An independent [nine-case repeat](../../evidence/config-studio-independent-20260921/url-probe-corrected.json)
rejects the original backslash case, credentials, query, fragment, path and NUL;
ordinary HTTP, HTTPS and IPv6 origins pass. Relevant source hashes match before
and after this repeat. This accepts the corrected URL boundary only, not the
whole migration. No passing source claim is inferred from the initial failure.

## Remaining review scope

Verify complete shared-schema/loader and canonical-author integration; preserved
role-specific environment behavior; every listener/probe/Service/network-policy
reference; original HTTP assertions/deadlines; the packaged shared-loader/schema/
Ajv dependency closure; mutation checks and source-bound final results. The image
now copies Ajv and its four dependency packages rather than the entire pruned
dependency directory. Package-lock closure and actual delivery still need final
review. Actual image build/run remains a separate open gate. Direct comparison
of the original service test shows its seven cases, assertions and deadlines
preserved; the fixture now supplies the canonical document and two new live
snapshot/deadline cases are added.

The author also identified an obsolete Control preference-subject instruction in
the operator guide. Its correction must name the current swarm field, `null`
default and rejection of the former Helm/environment authorities. Documentation
review must include that stale path rather than checking only the new Studio text.
