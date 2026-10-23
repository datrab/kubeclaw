# Executable producer/discovery-adapter integration

Baseline: `d4b50c582f0675e4c7325f6b10e71cc3f52f0d45`.

## Implemented batch

`tests/verification/integration/evidence-discovery-adapter.test.mts` is a
re-runnable integration test, not another generated synthetic-loader diagnostic.
It builds a registered package around the checked-in concrete provider and runs
`RegisteredTestProviderLoader`, its verified package snapshot and isolated child,
`TestPlanRunner`, both real staging selections, an injected custom store backed
by `FileEvidenceStore`, and the actual final managed/durable evidence consumer.
Build its sandbox first with `npm run plugin-system:sandbox:build`.

The new Source-owned observation adapter is
`tests/verification/helpers/observed-evidence-discovery.mjs`. It reacquires the
selected producer, staging/selection, loader, child and durable-consumer Source
pins on every call. It compares full original, captured staging and final durable
file bytes against the selected exact producer profile before interpreting DATA.
The runner deletes staging after completion; the test captures independently
read full bytes at the live custom-store input boundary, retaining which real
`selected` or `error` path supplied them. It does not pretend those deleted
staging paths can be read after completion.

All YAML documents are parsed; a JSON List is retained in full and its ordered
items are also emitted with document/item provenance. Neither media type nor
claimed size/digest is used as preservation authority. The two fixture profiles
are concrete synthetic outputs, not a bound on arbitrary registered providers.
No provider, runtime, role registry or release receipt is modified.

## Executed controls

- Eight real isolated-provider runs: YAML/JSON × completed/error staging × full
  retention/downstream loss. Error staging is reached by an intentional first
  store failure; the attempt correctly remains errored.
- The four loss controls remove the second document/item only after the default
  backing store has written the complete input. The custom store returns even
  internally consistent size/digest for the truncated output. The runtime's final
  durable file still loses DATA; the adapter independently rejects its bytes.
- Successful discovery retains both named API objects, the entire List where
  applicable, and never grants a static role or whole-provider-family claim.
- Reusing a warm adapter after final-byte changes rejects the altered consumer;
  restoring original bytes permits the observation again. A changed selection
  and a newly appended unseen API document at the producer are rejected.
- Eight selected Source/profile files are changed individually in an owned copy.
  Both new (cold) and already-acquired (warm) adapters reject every change before
  DATA interpretation. No runtime source is changed by these controls.

Coordinator command:

```sh
node --test tests/verification/integration/evidence-discovery-adapter.test.mts tests/verification/integration/evidence-staging-api-boundary.test.mts scripts/tests/exposure-predecessor-role.test.mjs scripts/tests/api-output-custody.test.mjs
```

53 controls passed (9 new integration/custody tests and 44 existing controls).
Early harness failures (resolver retry policy, missing sandbox build, trailing
root separator, reading already-deleted staging) are retained in operations
proof alongside the successful run; none are counted as passing observations.

## Authority limit and remaining work

This implements the previously missing concrete producer → observation adapter →
complete-document discovery test, including real isolation, custom-store loss and
cold/warm changes. It does **not** integrate a positive authority into static
`discoverScriptApiOutputs`. Its result explicitly says observation-only and
`staticRoleGrant: false`; the canonical five DATA slots remain UNKNOWN.

These selected pins do not claim a complete dependency/caller/loader/parser
closure. The read-only adapter assumes coordinator-owned quiescent files, not
adversarial concurrent filesystem mutation. It is deliberately kept in test
helpers and is not a product publication or security boundary.

The substantive remaining static-discovery issue is different: arbitrary
registered providers and custom stores have no finite Source-owned DATA roster.
An exact observation cannot waive unseen runtime DATA or establish complete
family coverage. A positive authority would need its own complete source/input/
selection/caller closure and full producer bytes through its final consumer, or
must reject that unsupported context. The adapter tests do not renew existing
custody metadata or bypass that independent contract.

No acceptance record is updated: 56/89 gates and 224/261 requirements remain
accepted. `RELEASE_CONFIGURATION_CHANGED: charts/kubeclaw/files/config/knip.json`
remains preserved. No release receipt is rewritten.

## Closeout checks

An additional 30 unchanged classifier/utility-declaration controls pass, including
all five original DATA slots, custom-store publications, stale/forged/deleted
receipts and warm changed receivers. This is 83 passing coordinator controls
across two nonoverlapping suites, not 83 integration runs.

Pinned autoreview `fe588b1a6267eb47f785d0c748db9f6f3e9a3b4f`, local mode,
Codex `gpt-5.6-terra`, high, P2: exit 0, no actionable findings. Invocation used
`autoreview-terra/scripts/run-autoreview.sh --mode local --max-priority P2
--codex-bin /app/extensions/codex/node_modules/.bin/codex --json-output
<operations evidence>/review-adapter-integration.json` with explicit scope/context.
The complete dirty bundle was 36,367 bytes; the helper's 180,000-byte per-file
input bound was inspected first and no truncation was reported. Initial missing
TruffleHog was repaired by using the already installed pinned tool, not bypassing
the scanner. Reviewer-executed tests and independent adjacent-source inspection
are not established by the structured verdict; coordinator tests remain separate.
This is bounded change review, not global Source/Reader/Quality acceptance.

The fresh publication check also passed: 177 pages, 51 plugins. Its original
command was `node scripts/docs-publication.mjs check`; no reader build, browser,
screenreader or whole-publication acceptance follows from that check alone.


The recovered original receiver completed on2026-10-23 at19:56:06 UTC, exit1,
again at `API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED: artifacts.ts:41: content`.
The prior18:50 attempt remains unobserved; this is a separate fresh execution.
First recovery failures (missing Go in PATH and the temporary sandbox binary as
the sole additional caller fact) are retained in operations proof. Removing that
owned, unused test build restored all1005 original caller facts exactly; no
custody hashes were changed. Diagnostic tools were installed Go1.26.5 and
Helm3.18.4, not a claim of matching CI's documented pins. The five DATA slots and
selected-release Knip failure remain unchanged.
