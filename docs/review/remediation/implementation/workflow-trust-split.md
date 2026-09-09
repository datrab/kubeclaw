# Workflow validation and trusted publication

IFR-22-001 is addressed locally in the two requested workflow entrypoints.
The Ops PR build previously received `packages: write`, and Docs internal PRs
executed repository generators with `contents: write` and pushed commits. Manual
Ops runs also published from non-main branches.

## Event and permission boundaries

Both workflows now default to `contents: read`. Their separate validation jobs
run for pull requests and non-main manual dispatches. Checkout credentials are
not persisted, registry login and publication are absent, and Docs rejects
regeneration drift for internal and fork PRs alike. They upload no artifacts for
a privileged job to consume.

Privileged jobs explicitly allow only `push` or `workflow_dispatch` with
`github.ref == 'refs/heads/main'`. Ops publication retains `packages: write` plus
read-only source access. It checks out and builds source independently of PR
validation, without importing a PR build cache or artifact. The existing actual
Ops MCP and Codex tests, image build, attestations, digest-addressed pull, image
smokes, and digest/source-commit receipts remain. Receipt preservation depends
on this trusted publish job and repeats the same event/ref guard. Its existing
local reusable workflow consumes only artifacts of that trusted workflow run.

Docs has a separate main-only `contents: write` update job. It checks out the
triggering source SHA, regenerates the same two documentation sets, and runs all
existing checks before staging only `docs/generated` and `docs/reference`.
Its non-force push explicitly targets main. A concurrent main change can reject
that push; the workflow does not overwrite it. Package caches are disabled here
and in the Ops Node setup, so privileged work consumes no validation cache.

## Action source binding

Every external action in these two entrypoints now uses a full commit SHA.
Authenticated official-repository commit lookups resolved each existing tag;
the action manifest was then fetched at that immutable SHA and its Git blob hash
verified from the returned bytes. The evidence file records tag, commit URL,
manifest Git blob, and SHA256. No action major/minor selection was upgraded.
For updates, resolve the intended official tag to a commit again, inspect the
upstream change, verify the manifest bytes, update the pin and provenance together,
and rerun the semantic checks in a reviewed PR. Do not restore floating tags.

- `actions/checkout@v6` → [d23441a48e516b6c34aea4fa41551a30e30af803](https://github.com/actions/checkout/commit/d23441a48e516b6c34aea4fa41551a30e30af803).
- `actions/checkout@v4` → [11d5960a326750d5838078e36cf38b85af677262](https://github.com/actions/checkout/commit/11d5960a326750d5838078e36cf38b85af677262).
- `actions/setup-node@v6` → [249970729cb0ef3589644e2896645e5dc5ba9c38](https://github.com/actions/setup-node/commit/249970729cb0ef3589644e2896645e5dc5ba9c38).
- `actions/setup-node@v4` → [49933ea5288caeca8642d1e84afbd3f7d6820020](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020).
- `azure/setup-helm@v4.3.1` → [1a275c3b69536ee54be43f2070a358922e12c8d4](https://github.com/Azure/setup-helm/commit/1a275c3b69536ee54be43f2070a358922e12c8d4).
- `docker/setup-buildx-action@v4` → [37fe631027851001ddb9b187196cc803df7f5f0e](https://github.com/docker/setup-buildx-action/commit/37fe631027851001ddb9b187196cc803df7f5f0e).
- `docker/login-action@v4` → [dbcb813823bdd20940b903addbd779551569679f](https://github.com/docker/login-action/commit/dbcb813823bdd20940b903addbd779551569679f).
- `docker/metadata-action@v6` → [dc802804100637a589fabce1cb79ff13a1411302](https://github.com/docker/metadata-action/commit/dc802804100637a589fabce1cb79ff13a1411302).
- `docker/build-push-action@v7` → [53b7df96c91f9c12dcc8a07bcb9ccacbed38856a](https://github.com/docker/build-push-action/commit/53b7df96c91f9c12dcc8a07bcb9ccacbed38856a).
- `actions/upload-artifact@v4` → [ea165f8d65b6e75b540449e92b4886f43607fa02](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02).

## Verification and limits

`docs/review/evidence/workflow-trust-split.txt` records five passing tests that
parse the actual YAML with duplicate-key rejection and check the job event/ref
matrix, effective declared permissions, credential persistence, artifact/cache
boundaries, image digest smoke/receipt sequence, documentation checks before
push, and immutable action references. The small expression evaluator supports
only the boolean event/ref subset used by these guards; it is not a GitHub runner
or proof of live token permissions. Focused canonical ESLint and diff checks pass.

The existing generator/checker scripts, both real image smoke scripts, and receipt
preservation workflow were read to preserve their behavior. No image was built,
no native isolated PR was run, and no token, registry, GitHub Actions, CI trigger,
or deployment was exercised. Operational trust-boundary verification remains open.
Other workflows still use action tags, including the receipt preservation callee;
the exact observed list is retained separately in the evidence file. This slice
does not claim repository-wide action pinning.

Frozen paths: `.github/workflows/{build-ops-mcp,docs-checks}.yaml`,
`tests/verification/contracts/workflow-trust-split.test.mjs`, this note, and
`docs/review/evidence/workflow-trust-split.txt`. No commits were made by the author.
