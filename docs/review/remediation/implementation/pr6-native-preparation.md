# PR 6: native acceptance preparation and executable Knip

Source parent: `0f673eacaef206fb6846672bce1fe856209d7ac7`. All 39 incomplete
IDs are frozen in `../resume/run-20260912-pr6-5h.json`; no finding has been closed.

`npm run knip:check` previously could not execute the declared gate: Knip was
pinned only in `docker/nova-tools`, not installed by root `npm ci`. Root now
declares the same exact Knip 6.27.0. The lockfile includes its actual resolved
dependencies; existing package versions and libc restrictions are retained.
The complete original Knip command now executes and reports real outstanding
entrypoint/dependency/export findings. These are failures, not an accepted SDK
cutover. Raw before, installation and after logs are retained under
`docs/review/evidence/pr6-native-preparation/`.

The read-only `Native remediation acceptance` workflow runs on PRs and exposes
three isolated jobs: original PostgreSQL corpus/transactions/readiness tests,
actual Chromium Studio assertions, and original supervisor adoption. It receives
no repository secrets, production configuration or write permissions and does
not deploy, publish images or contact users. The test PostgreSQL image uses the
existing exact pgvector image digest from the repository, referenced through
`versions.json`. Checkout credential persistence is disabled.

The PostgreSQL harness creates and drops a fresh UUID-named database per original
suite on the explicitly configured loopback test service. It runs full original
migrations for readiness; the transaction suite retains its own original SQL
setup. Original test code and success assertions are unchanged. Missing database,
unknown suite, failed child, timeout or skipped readiness cannot yield success.

Local checks: workflow YAML and central version validation passed; the Prism
TypeScript project and canonical lint on the native wrapper passed. Invalid-suite
and missing-database executions failed explicitly. Native positive execution is
pending GitHub Actions; preparation is not a passing native acceptance report.
The special blocked semantic-helper action is not invoked by this workflow.

Timing is recorded honestly: work started 07:05:10 UTC. Last pre-interruption
evidence ended 07:11:49 UTC; work resumed at the user's status request at 09:03:55
UTC. That 1:52:06 gap is excluded from the requested five active hours.
