# Retained configuration language view

This native documentation operation changes reviewed editorial wording in one
supported historical configuration snapshot. It does not acquire current facts,
repair producer custody, qualify current API roles or replace the ordinary full
inventory check. Its output must not be used as proof of those operations.

The supported artifact commit is
`145da1d0b30fb3b636c4b03fb3d3252819ee2bf5`. Its recorded source commit is
`6fa4830a48244d29655104a5be58957d5fa87d2f`. The adapter checks the complete
immutable inventories and the source tree relationship. The historical owner
constructors accept only the pinned complete owner source. Input source bytes
are not evaluated or imported as code.

The editorial owner is `lib/docs-configuration-editorial-language.mjs`. Normal
configuration discovery uses the same maintained ENV and quantity wording, but
still requires its original acquisition and qualification checks. Historical
Helm field contracts remain unchanged in the authority registry. The view uses
their declared owners and reconstructs complete old meanings before it changes
editorial cells. All other fields, unknown keys, Secret facts, qualification
states and upstream quotations must remain unchanged.

## Produce and check

First review and commit every changed source, including generators and tests.
Run the CLI from that same physical checkout. The editorial revision must match
its complete current source tree. Generated/site content and completion records
are not source authorities. An uncommitted owner cannot attest another checkout.

Choose an owned output file outside the checkout. Its parent directory must
already exist and have no symbolic-link path components. For example, after
choosing an unused sibling filename:

```bash
revision=$(git rev-parse HEAD)
bundle=../retained-configuration-language.json
node scripts/docs-retained-language-projection.mjs --editorial-revision "$revision" --output "$bundle"
node scripts/docs-retained-language-projection.mjs --editorial-revision "$revision" --output "$bundle" --check
node scripts/docs-generate.mjs --revision "$revision" --only retained-configuration-language --retained-language-bundle "$bundle"
node scripts/docs-generate.mjs --revision "$revision" --only retained-configuration-language --retained-language-bundle "$bundle" --check
```

The selected renderer authenticates the entire bundle again. It uses the
versioned historical renderer, not the current API datatype with invented empty
fields. It changes only the complete Helm and ENV reference pages. Before any
page write, it checks both destinations and their parents. Symbolic links and
hard-linked destinations are rejected. Individual page writes use a staged file
and rename. The operation is not a transaction across both pages: inspect and
repeat the selected check after an interrupted write.

The page notice distinguishes historical artifact, historical facts and current
editorial source. Historical fact links retain their original source revision.
The inherited snapshot metadata is not a current discovery or runtime claim.
The shared source revision lock, original inventories and authority registries
are not rewritten. `--update-source-revision` is not accepted for this selector.
A selected check does not make an unrelated ordinary check pass.

## Review boundary and cleanup

Tests in `tests/documentation/retained-language-source.test.mjs` cover immutable
inputs, source relationships, path boundaries and failed/check-only writes.
`retained-language-renderer.test.mjs` compares both complete historical baseline
pages byte-for-byte and checks row and upstream-quotation preservation after
projection. These are scoped mechanical checks, not the complete language review.

Review the changed editorial meanings and the delivered pages independently.
Keep actual failures and acceptance limits. After the work and any active
consumer finish, remove the owned temporary bundle and review checkout. Keep
only the provenance, hashes and review evidence that are still needed.
