# Browser-bound visual baselines

PCR-VISUAL-001 is implemented in the actual baseline producer, manifest contract,
provider and preflight consumers. Native capture/upgrade acceptance remains open.

The previous manifest identified browser family and page conditions but omitted
the browser build. The current capture's version was only written into a report
after comparison. A browser upgrade could therefore reuse an unbound baseline.

`kubeclaw.visual-baselines.v2` requires the exact observed `browserVersion` on every
entry. The provider checks that identity against `browser.visual`'s actual
`browser.version()` output before decoding/comparing images. A mismatch identifies
the target and both versions. The report retains both identities. The existing
manifest digest binds this field along with every other manifest byte; the
separate image-bundle digest continues to identify the image set only.

The real baseline generator and both native visual verification consumers record
the version from the browser they actually launch/capture. The generator accepts
an explicit executable argument or the installed Playwright executable. It no
longer embeds an obsolete hard-coded browser-revision path. No browser is
downloaded, substituted or claimed to have run by this change.

## Migration and verification

V1 manifests fail with `VISUAL_BASELINE_MIGRATION_REQUIRED`; missing/invalid v2
versions fail explicitly. There is no automatic migration or guessed identity.
The historical nginx production-preflight fixture remains v1 because its capture
version cannot be recovered from the stored PNG. The preflight now detects that
locally before capability resolution, submission or deployment. Operators must
recapture and review the resulting baseline/manifest change separately using the
intended worker browser. Merely inserting its current version into old files does
not establish that identity. The example version is only a schema example.

Three local tests pass: real schema/runtime identity agreement including NUL and
whitespace boundaries; original-provider rejection before a capture capability is
needed; and the actual production-preflight process rejecting the historical
fixture before dispatch. The original visual implementation/registry/resolver
check also passes. The [complete output](../../evidence/visual-browser-identity.txt)
records these commands and focused canonical lint, without mocks or skipped tests.

The original native browser test now includes an obsolete manifest version
against genuine capture, followed by acceptance of the restored genuinely
captured baseline. It has not run here: the known required Chromium executable is
absent. The generator and native remote vertical also remain unexecuted. Local
schema and preflight checks do not establish a successful screenshot comparison,
two-installed-browser upgrade, renewed baseline approval or remote E2E execution.

Canonical lint is clean for the new helper/test and changed generator. The
provider has the same five pre-existing complexity/length violations: endpoint
complexity 18, manifest complexity reduced from 28 to 27, execute complexity 48,
and the provider/execute length now 69 versus 68 lines. No rule was disabled.

The v1 schema file is replaced by v2; the cutover inventory, schema example,
provider/Prism/setup documentation and operator upgrade instructions point to the
new contract. Existing historical review findings remain unchanged. Functional
closure still needs actual browser recapture/review and the native regression.
