# Adapter dependency identity — incomplete source checkpoint

Fresh remote base: `9628872976da8d43c3a17faa89962f9e32d88979`.
Local exact-tree base: `8734df524702729b94f8c5c385993225b552079b`.
This is incomplete work, not reviewed integration or PCR-SDK-001 closure.

Original registered consumer, HTTP adapter, EffectCoordinator and FileEffectJournal
reproduce a genuine defect: SIGKILL after one completed HTTP child but before
parent completion, followed by Swedish-locale recovery, sends identical HTTP
body twice under two legacy child keys. Same-locale recovery sends once.
Raw before output is retained; no journal/receipt was manufactured.

New child keys explicitly carry json-utf16-v1 and hash a portable versioned
subject. Existing registry parent-invocation.v1 remains unchanged: it records
parent ownership, not the new child codec. Historical lookup uses the actual
ordered journal, exact semantic child and parent owner suffix, original parent
request, effect identity and ambiguity checks. It never guesses a locale or
silently rewrites old keys. Indexing is per exact semantic subject, with separate
corrupt-key scope detection so orphan/changed accepted or receipt facts cannot
disappear behind a request-map overwrite. Lookup occurs again under the original
effect resource lock. Existing durable accepted/failed/unknown behavior remains
owned by the original coordinator, not a substitute retry path.

Confidential parent mode comes from the genuine internal invocation; missing
durable parent cannot masquerade as confidential. A confidential parent has no
invented historical journal record; its existing live ownership semantics remain
explicit. Activation remains the original adapter-scoped owner.

The original generated EffectRequest opaqueId resource schema rejects actual
network URL resources and long nested keys written by its own producer. This
slice does not weaken that schema or falsely claim conformity. Its internal
lookup validates exact original producer shape/version/date/attempt/capability/
operation/resource/payload and original effect identity, preserving actual
URL-bearing capability semantics. That pre-existing schema mismatch remains
a separately documented boundary.

Initial original regressions exposed an unnecessary await affecting unrelated
admission-race scheduling and the schema mismatch above; both actual failures
are retained. The original adapter identity and effect identity suites now pass
4/4 with no skips. Historical producer files are archived with freshly obtained
remote blob hashes. Further new/current and old/new actual SIGKILL tests,
independent corruption/concurrency/failed/pending proofs, full typecheck and
canonical lint are still pending at this checkpoint.

Next action: complete new original fixture tests and independent review; preserve
wire JSON insertion order while validating/cloning mutable input; recheck current
snapshot/CLI regressions without changing the older registry marker. Publish
this checkpoint only to an isolated repair branch until Root approves tested
source. No deployment, CI, production mutation or third-party message.
