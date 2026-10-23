# Current Nova SDK envelope boundary — source checkpoint 6606af9

Six [actual current contract-validator controls](current-sdk-envelope-attempt1.log)
passed, using the unchanged exported `validateContractValue('lifecycleEvent', …)`
and synthetic JSON fixtures. [Source/check/dependency identities](source-and-check-identities.json)
record the exact method and scope. No stage, observer, package activation, effect,
module recovery or new typed event was executed or implemented.

- A complete current `stage.started` envelope validates.
- `module.binding.accepted` is not in the current lifecycle-event.v2 type enum.
- `identity.moduleId` and top-level `binding` reject as additional properties.
- Inner sequence zero rejects at the actual minimum boundary.
- An arbitrary nested `payload.binding` validates as generic JSON. This is **not**
  validation of module membership, original authority, profile closure or quota.

The current runner creates the inner sequence with `appendSequenced`; current
recovery filters on `lifecycle-event.v2`. Observer delivery uses its current typed
event contracts. A generic journal specimen or generic payload must not be
advertised as a typed, durably recoverable module carrier. The eventual target
requires an explicit versioned SDK/event/reader/observer compatibility migration,
alongside the preserved original snapshot/codec rules. Those definitions and
cross-reader cases remain open; no new version number is silently selected here.

These narrow source/definition observations remain independently unreviewed and
do not close universal module-binding or global C0 acceptance.
