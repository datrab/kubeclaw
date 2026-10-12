# Required child observation policy draft

The separate `policy-files` generation builds on the reviewed session class and leaves the original class-only draft intact. It is not integrated or executed. The Buster execution-policy author is preparing the parent loader/central-owner wiring separately.

The child requires `initialize.observation.resourceSampleIntervalMs`, checks its exact shape and positive timer-safe integer domain, and creates the sampler only after successful validation and before provider import. Initial RSS is still captured at process startup. Parent process sampling remains a separate explicit interval owned by the same central Buster observation section. This changes when recurring child sampling starts; it is not claimed as a byte-identical ownership extraction.

The same session cannot silently switch observation policy; identical repeated values do not create an additional sampler and changed values fail. The child has no replacement default. The private tests supply explicit values, reject omitted/invalid/extra fields before provider import, and exercise two actual timer profiles (10 and 40 ms).

The timer test's preload records scheduling and callback delivery while forwarding the original delay, arguments, callback receiver and return value to the real Node timer. It does not replace the sampler with a modeled implementation or invent elapsed-time results. It proves the child consumes the requested delay and the real callback runs; it does not prove precise OS scheduling or kernel memory enforcement. Original full sandboxed Runner/provider tests, whole central-owner-to-child propagation, missing-value and hardcoded-delay mutation controls, types, lint and a fresh independent review remain mandatory before acceptance.
