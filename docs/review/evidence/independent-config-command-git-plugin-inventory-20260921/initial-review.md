# Independent Command/Git inventory review

Status: review in progress; one correction required. No production change,
runtime integration test or overall CONFIG acceptance.

The schema/factory comparison confirms the fourteen fields, required numeric
values, different relative-path behavior, Git's missing direct-factory upper
bounds and workspace creation before later validation. The actual Command
factory builds its executable set as the union of explicit paths and catalog
targets. Its shared runner separately supplies resource defaults; these are not
all active sandbox limits of the plugin. Git's empty child environment does not
disable repository configuration or prove credential isolation.

## Required correction: catalog identity is not grantable through the normal registry

The author report describes a `catalog:name` grant as an identity grant, but the
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

The inventory must state this integration limitation and bind the additional
registry consumer. A configuration migration must explicitly resolve the intended
contract with tests; this review does not authorize a silent broadening of grants
or relabel direct adapter calls as normal production authorization.

An initial suspicion about escaping of the Git identity schema regex was checked
with the actual Node RegExp implementation and was not reproduced: ordinary
identity strings passed and CR/LF/NUL strings failed. It is not a reported schema
defect and does not justify a schema change.
