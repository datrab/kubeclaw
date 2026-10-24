# Project profile v1 — inactive shape contract

This schema is an admission foundation, NOT an execution capability or an
authorization decision. No runtime/controller imports it yet; admission.mts is exercised only by tests. Existing fixed
bootstrap branches are not migrated by adding this file.

Only bounded random values and concatenation are specified here. Literals are
inert data: never interpolate environment, templates or commands. TLS needs a
separate closed primitive and namespace-bound SAN validation before use.

Before activation, BOTH TypeScript and Go admission must enforce: byte-exact
64KiB document digest and authenticated project/immutable revision policy binding;
unique IDs, Secret names/keys/consumer identities; earlier-only references (no
cycles); reserved private journal names; aggregate encoded output <=64KiB or lower
policy ceiling; exact manifest Secret key/consumer matches; unexposed lease and
TTL/resource ceilings. JSON schema alone cannot establish these properties.

Required follow-up: shared semantic rejection vectors, controller parity,
project-owned definition, private interpreter/journal CAS recovery, review and
Buster-only delivery. Never enable a path based solely on schema validity.

Inactive TypeScript admission now checks byte-exact digest and identity against an
independently supplied policy, TTL, unique names/keys/consumers, earlier-only
references and encoded generation/output byte ceilings. Policy acquisition, Go
parity, exact manifest consumers, journal-name integration, TLS and runtime wiring
remain required. This helper is NOT sufficient to authorize execution. The buster-
Secret prefix is reserved for future platform-private objects.

`admission-vectors.json` is the language-neutral parity corpus: raw UTF-8 JSON
strings, fully specified synthetic policy, and exact sanitized errors or byte
counts. Consumers must not reserialize `raw` before digest validation. The 17
vectors currently run against TypeScript only; Go must consume the same corpus
before parity can be claimed. No credential generation or execution occurs.
