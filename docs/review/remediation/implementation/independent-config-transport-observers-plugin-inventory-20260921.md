# Independent transport and observer configuration inventory review

Status: accepted as a bounded source inventory. The reviewer did not author the
inventory. This is not implementation acceptance, executed plugin tests, a live
Redis/OpenClaw check or completion of CONFIG/F1.

The 55 named live sources match their saved bytes, sizes and hashes. An independent
walk of the four configuration schemas reproduces all 17 field patterns and 23
registration occurrences, including full nested target constraints, required
fields, enum values and annotations. Both Redis registrations and both observer
registrations remain explicit. An initial comparison incorrectly expected the
manifest's nested `requiredInTarget` field to be named `required`; the reviewer
corrected that assumption after inspecting the exact data. No source constraint
was changed or excluded to make the comparison pass.

The actual decoders and consumers support the reported distinctions:

- Redis requires explicit six-field configuration and uses direct TCP/TLS. The
  normal schema is stricter than its direct URL/TTL decoder. Approximate stream
  retention, dedup expiry and parser byte ceilings are different limits.
- HTTP publication retains three nullish code defaults. Durable record quotas,
  terminal reservations and per-target serialized payload limits are separate
  from selected network-provider policy. Real request persistence precedes secret
  resolution and publication; terminal transitions use the prior payload digest.
- Agent observers have empty config schemas but still obtain retry/deadline
  policy from their manifests and a memory lease budget from Core. The reviewer
  additionally inspected and bound `observer-recovery.ts`: prior attempts and
  completed deliveries are recovered from validated records, not reset merely
  because delivery restarts. This remains source evidence, not a restart test.
- OpenClaw queue defaults remain code authors. The queue retains its emitting
  head in count/byte accounting, removes failed emissions and does not cancel an
  active emit when a drain wait expires. External SDK availability is required.
  Event projection and privacy constraints are not hidden model/network settings.

Registry validation, adapter startup and invocation authorization were inspected
together. Their schemas validate without applying defaults on this path; factory
fallbacks therefore matter. Declared provider dependencies and caller grants are
distinct from plugin configuration. The actual target/source/event-prefix and
artifact-namespace constraints support the reported identity forms. Adapter
startup routes confidential capabilities through confidential execution even
when the plugin uses the ordinary invocation method.

No missing configuration field or contradictory consumer claim was found within
these four plugin trees. Their proposed central files are still proposals. The
real orchestrator loader, immutable snapshot binding, removed defaults, historical
state handling, original suites, two-profile consumer tests and documentation
updates remain required implementation work. The acceptance criteria retain
those obligations and correctly avoid claiming deployed behavior from models.

Evidence is under
[`independent-config-transport-observers-plugin-inventory-20260921`](../../evidence/independent-config-transport-observers-plugin-inventory-20260921/):
`source-comparison.json`, `schema-comparison.json`, the preserved initial checker
error and the additional recovery-source snapshot. These named source bindings
are not a complete runtime dependency closure or a proof of test correctness.
