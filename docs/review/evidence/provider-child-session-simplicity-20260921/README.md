# Provider child session ownership draft

Private, unexecuted root draft. The live LC/PC review freeze is unchanged. `identities.json` binds the original and draft bytes; `change.patch` is reviewable before integration.

The process has one explicit `ProviderChildSession` owner for pending RPCs, sequence, provider instance, invocation/context, cancellation, resource sampling and readline lifecycle. Initialization, execution, cleanup and RPC retain their existing checks and message shapes. Each input line still starts independently: serializing the input stream would deadlock capability results behind an executing provider. The permanent SIGTERM handler still aborts the same controller used by provider context and RPCs. Console routing and dynamic import remain visible, unchanged boundary operations.

This draft addresses the five module-state findings. It does **not** pretend to solve the other seven lint findings. The child really is the provider-loading and console-to-protocol boundary; that needs an explicit architectural review against the existing declared isolation-child boundary, rather than obfuscated console access, indirect import, inline suppression, or a broad rule exemption. No lint configuration was changed.

The existing 10 ms memory sampling cadence remains a separate policy-author question under D17. This ownership refactor neither migrates it nor certifies it as an immutable protocol constant. It must be classified and, if configurable, supplied explicitly by the appropriate central execution policy with missing-value rejection. Diagnostic fallback messages and zero successful process exit status are error/protocol semantics, not silently inferred operator settings.

Acceptance before integration closure:

1. Independently review method binding, startup/console timing, concurrent receive behavior, resource accounting, pending RPC abort/settlement and idempotent SIGTERM handling against the bound original.
2. Run the complete original Runner and real-provider contracts with the actual child, retaining original cooperative abort markers, forced-stop deadlines, logging limits, process cessation and unresolved negatives. Run the real handler-removal control against the final implementation, not an outdated copy.
3. Include all original capability/RPC cancellation, child protocol and cleanup tests applicable to this source. Do not replace the child with a mocked provider transport.
4. Run canonical lint for the actual production path; report all remaining findings. No green quality claim based only on the five removed state declarations.
5. Update the maintained Buster execution boundaries documentation to explain the session owner and process boundary; retain actual native/image/live limitations. Bind sources and obtain fresh nonauthor review after tests.
