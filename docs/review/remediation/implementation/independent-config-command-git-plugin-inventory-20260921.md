# Independent Command/Git inventory review

Status: corrected bounded source inventory accepted. No production change,
runtime integration test or overall CONFIG acceptance. The
[independent comparison](../../evidence/independent-config-command-git-plugin-inventory-20260921/source-comparison.json)
checks all 27 original snapshots, the corrected 28-source manifest and exact
coverage of all fourteen schema fields with nested constraints. Original source
bytes are unchanged; the corrected report and added registry consumer use the
explicit additive snapshots. An initial reviewer script assumed a complete v2
snapshot copy instead of the documented additive layout; that failed check is
retained separately and was corrected before acceptance.

The schema/factory comparison confirms the fourteen fields, required numeric
values, different relative-path behavior, Git's missing direct-factory upper
bounds and workspace creation before later validation. The actual Command
factory builds its executable set as the union of explicit paths and catalog
targets. Its shared runner separately supplies resource defaults; these are not
all active sandbox limits of the plugin. Git's empty child environment does not
disable repository configuration or prove credential isolation.

## Corrected finding: catalog identity is not grantable through the normal registry

The original author report described a `catalog:name` grant as an identity grant, but the
actual normal registry path cannot create that grant. In
`foundation/registry/capability-vocabulary.ts`, `validateAbsoluteLists` rejects
every `allowedExecutables` item that is not an absolute normalized path.
`constraintLists` always invokes it, and `foundation/registry/capabilities.ts`
invokes `validateCapabilityConstraints` when constructing grants.

At invocation, `nova/core/execution/authorization.ts` compares the requested
executable identity exactly against those grant strings. Authorizing a catalog's
resolved absolute path therefore does not authorize the different `catalog:name`
identity. The adapter's own catalog support and allowlist union remain real;
they do not establish end-to-end catalog use through Nova's normal grant path.

The corrected inventory states this integration limitation and binds the additional
registry consumer. A configuration migration must explicitly resolve the intended
contract with tests; this review does not authorize a silent broadening of grants
or relabel direct adapter calls as normal production authorization.

An initial suspicion about escaping of the Git identity schema regex was checked
with the actual Node RegExp implementation and was not reproduced: ordinary
identity strings passed and CR/LF/NUL strings failed. It is not a reported schema
defect and does not justify a schema change.
