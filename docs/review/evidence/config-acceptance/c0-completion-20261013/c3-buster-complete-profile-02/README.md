# WCR02 whole Buster C3 correction02 — BC3-01..04

Status: **additive author proposal; fresh independent material review required**.
Preserves c3-buster-complete-profile-01 and independent review01 exact bytes.
No global C0, implementation, native, package or runtime acceptance.

This is a complete replacement test-generation proposal at the SAME author paths:
config/pipeline.config.json plus six config/components/{owner}.config.json files.
Buster has91 complete profiles; all six documents have96 declared whole profiles.
The original86 Buster settings remain unchanged. Add one dedicated reason-threshold
A and four whole supported-capability-subset stands. There is no seventh author.
Root/owner/runtime versions remain proposed C3 entry.v4/component.v3/runtime.v2;
value-preserving C1 entry.v3/component.v2 is an explicit dependency, not a way to
backfill C3 fields into C1. Original rows/cases/requirements and all not-run phases
remain conserved. Retain01's97-byte response floor/bounded fallback, serialized
record/result/state/claim/source/retention accounting, source-key-before-effect,
native shutdown bounds, original history, tar-parent reference and peer/grant
contracts. This correction changes only the four cited material seams.

## BC3-01: supported optional TLS, generated references only

The closed generated runtime schema now supports optional `{tls:{keyPath,
certificatePath}}`, with both nonempty/non-NUL references required, unknown members
rejected. Absolute and source-relative references remain supported; relative refs
resolve from the authenticated original runtime generation, not cwd. The supported
producer modes are explicitly cleartext-proxied or server-tls in the existing
role/deployment transport receipt. Cleartext deliberately emits no tls; this is
not omission→default at owner selection. Server-tls emits BOTH refs. Proxy SPIFFE
peer/token authorization remains separate from server TLS and registry HTTPS;
server TLS is not magically mTLS or a permission grant.

[tls-reference-contract.json](tls-reference-contract.json) ties the productive
production.ts::configuredRuntime→BusterRemotePlanRuntime→remote-plan-http.ts
https.createServer branch to the original selected role/provider transport closure.
No new TLS settings/private-key author is introduced. The generated runtime refs
come from authentic existing deployment/provider receipt, never handwritten root
policy or secret bytes in the component owner.

C3 exact admission delta: before store/root/discovery/listen effects, capture the
original key/cert provider registration/code/schema/role/image/caller receipts and
revision/access/retention grant. Resolve only inside its explicit authorized root;
reject absolute refs outside that grant, relative escapes and untrusted aliases.
Open the captured physical regular leaves with O_NOFOLLOW; require original
ownership/mode/size receipt, size<=original provider maximumBytes, and recheck
file/ancestor observations before use. Kubernetes Secret projection needs the
provider's authenticated revision-safe physical capture, not blind symlink follow.
Parse actual key/cert with the current Node crypto/TLS consumer and require their
valid association before admission; supported algorithms derive from pinned actual
Node/OpenSSL consumer, not an invented certificate/key type. Keep bytes only in
sensitive memory and never config/output/log receipts. Missing provider revision/
file/trust/valid key-cert match rejects, including before filesystem store creation.

Historical A TLS reader/key/cert/role/provider revision is resolved first on replay.
Missing A cannot fill from B or silently omit TLS. The schema fixture
fixtures/generated-tls-runtime.json contains public **path references only** and
has no actual key/cert/provider receipt. Neither collector nor this author read a
private key/certificate/token or started HTTPS. Existing Runtime16 HOST network/
TLS/proxy-role case and canonical originals are retained with exact missing/wrong/
escape/unknown/history rejection oracles in future-case-joins.json.

## BC3-02: omission is at generated source layer, not policy validation

[capability-activation-contract.json](capability-activation-contract.json) and the
closed conditional generated-runtime schema settle the layer precisely:

| Capability | Generated source when active / inactive |
|---|---|
| command.execute | directCommand required / forbidden |
| container.build | containerBuild required / forbidden |
| network.http | networkHttp required / forbidden |
| browser.axe/lighthouse/visual/playwright | corresponding browser source required / forbidden |
| security.scan | securityScan required / forbidden |
| any fixture/exposure/runtime-security capability | shared clusterBindings required / otherwise forbidden |

ALL owner policy objects still validate in EVERY declared full profile, even if
that selected stand cannot activate their source. Only selected active sources
are generated/decoded/mapped/constructed. An inactive object, even equal-valued,
is an invalid competing generated payload and rejects BEFORE realpath/browser/
credential/native constructor work. Current capabilitySource decodes any present
optional object; therefore the C3 runtime.v2 closed eligibility validation is a
new explicit gate before that existing decoder. Omission then returns null and
actual option helpers return{} for inactive routes; no eager browserExecutableMap
or inactive command credential resolution. Current v1 does not enforce this new
conditional gate merely because it is documented.

The allowedCapabilities policy still permits **any nonempty subset of supported11
names**, not an arbitrary restricted subset to satisfy a schema. Actual registry,
provider identity, original signed node grant, package/role/host/store/executable
relationships additionally gate activation, never install from a valid profile.
New network-only, command-disabled, browser-disabled and network-only-health-disabled
stands are complete selected owner profiles, not partial configs or deployed claims.

### Dedicated registry reference is independent of container.build

registryPeer is generated from the EXISTING registry-client runtime receipt, with
its exact registryBaseUrl/registryReference and named credential/CA refs. It is
NOT container.build policy, provider installation or another transport writer.
Required iff container.build OR security.scan OR kubernetes.fixture OR
(active network.http AND explicit selected registryHealth=true). Otherwise omitted.
If active native objects repeat those generated peer refs, all must agree with
that SAME original receipt; no equal-valued independent registry author.

An active network-only stand with registryHealth=true and container.build absent
is supported: networkHttpOptions receives captured registryPeer rather than a
missing containerBuildSource. This is a concrete C3 production.ts configuredCapabilities
parameter/source delta. configuredClusterCapabilities likewise receives peer for
fixture health dependency without requiring container.build activation. Named
credentials are resolved only for actual selected consumers under original grant,
not by decoding inactive commandSources. Registry HTTPS/key/CA/revision facts may
remain unavailable and block that activation; public refs are not credential bytes.

Owner registryHealth flag remains required irrespective of subset. Network absent
means no networkHttp source/no active health path even if its stored policy flag
is true. Active network+true emits native true plus peer; active network+false
emits deliberate native flag omission and no health-only peer dependency. Native
false still rejects at actual mapper; never pass false as a purported native toggle.
A remaining independent registry consumer may still require peer when health off.
False removes only dedicated RegistryHealthAccess; ordinary allowed HTTP remains.
Wrong host/port, half credential pair, source grant mismatch or unsupported capability
rejects before effect. Full intrinsic owner metadata validation is not active
browser/tool/provider I/O or unrelated installation selection.

## BC3-04: exact dedicated complete reason-threshold pair

The general local-A remains threshold256/prefix180. Add reason-threshold-A with
**threshold256/prefix0**, preserving the exact original component17 complete A
settings before the added provider/service layers. Map this original threshold
case to reason-threshold-A versus the original complete B variant threshold72/
prefix0. Providers/service siblings are identical. fixtures/roots/reasonThreshold-A.json
selects that profile at the SAME Buster root tuple, not a separate author or patched
baseline. Existing B counterpart stays unchanged; general prefix EFFECT cases
still use their original prefix180 baseline as required.

The collector checks complete settings, not only named scalar values: all13
component17 original A AND B full settings match after removing only added
provider/service layers; every corresponding original body/case hash remains
linked. All64 provider A/B full settings and couplings match original18/21 fixtures,
including shared browser pointer and exact corrected registry-health B. No original
case is weakened into a two-policy threshold contrast. whole-profile-index and
future-case-joins explicitly name the dedicated A per original field.

## BC3-03: new actual reproducible evidence, not retroactive receipt

The old01 summary is preserved and downgraded to historical author observations
with missing raw command/harness/dependency provenance; historical-01-execution-summary.json
pins it. New02 execution does NOT authenticate the original17 PASS sequence.

The retained collect-definition-checks.mjs is a narrowly source-specific pure
collector for THESE whole artifacts and actual NetworkHttp mapper/constructor,
registry URL predicate and capabilitySources decoder. It is not a generic validator,
future native harness, broad suite or production/test change. It reads pinned
known inputs, invokes strict existing Ajv with no defaults/coercion, performs exact
full-coupling assertions and records actual source/code/input/dependency/tool
identities; no listener, browser, subprocess, store, network, key/token or provider
activation occurs. It does not write its inputs. Without --output-dir it emits
controls only; independent reviewers can use their own output directory.

Actual final command (repo cwd):

```sh
node docs/review/evidence/config-acceptance/c0-completion-20261013/c3-buster-complete-profile-02/collect-definition-checks.mjs --output-dir docs/review/evidence/config-acceptance/c0-completion-20261013/c3-buster-complete-profile-02/final-run
```

Retained final-run.stdout/final-run.stderr and final-run/definition-checks-02.json
record exit0, **24 actual pure controls**, six full owner documents/**96 profiles**,
**91 generated runtime/registry pairs**, static quota orders, TLS reference shapes/
unknown/missing negatives, full conditional source/peer gating and all13/64 original
complete A/B coupling assertions. Node executable/hash/version, Ajv entry/hash/version,
collector and actual JSON/source inputs are retained. Actual current network helper
accepts independent HTTP public peer shape without constructor IO; this is not the
implemented C3 configuredCapabilities path, installed registry or HTTPS credential
availability. The future C3 receiver parameter delta remains explicit.

Two early FAILED new02 attempts are preserved with raw stdout/stderr and attempted
owner/harness/schema bytes: missing added activation metadata in dedicated A;
then missing explicit keyword types in conditional strict Ajv schema. No strict
option, domain or causal assertion was weakened. Later intermediate passes are
raw history; the final collector/inputs stand is the reproducible current receipt.
commands-and-exits.json distinguishes those runs. Old01 raw compile attempt/profile/
summary/report bytes remain untouched, not replaced with this new evidence.

## Conserved contracts and outstanding acceptance

Retain 01 required whole schemas, original source/policy/target/case conservation,
97-byte actual fixed frame floor and rechecked bounded fallback; real job/state/
record/result/retained metadata charges before effects; source Ed25519/issuer/ref
validation before store creation; native timer bounds; original archive/claim/
grant/budget/fixed Eval; tar equality/delegation to parent; actual registry-only
three-domain platform reader. No Core unread box, new runtime author, default/
merge or C1 synthesis. The only new generated peer object is an immutable reference
projection of existing role registry source, not configuration authorship.

C3 runtime.v2 reader/materializer/source eligibility/TLS admission changes require
real later implementation; current production supports v1 and different decoding
ordering. C1 physical root/wire/value preservation must exist first; C2/C4 authentic
registry/provider/grant/tool/transport closure and C5 durable original binding/
secret revision/lifetime/fence remain dependencies. C6 executes actual consumer,
TLS/native key/peer/store/effect/mutant/recovery cases. All those cases remain not-run.

Missing installed/deployed roster, image/role/boot receipts, original source approval/
key/TLS/registry credential revisions, real browser/tool paths, native node/pool/
physical volume writer/capacity and authentic archived closures remain explicit
activation gates. No private key/tokens/credentials read or fabricated, no native/API/
Eval/deploy/production/schema/test change. Fresh independent recheck of all four
material corrections is required; this author does not approve its own proposal.
