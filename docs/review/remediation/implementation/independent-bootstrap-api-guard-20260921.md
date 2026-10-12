# Independent bootstrap namespace guard review — 2026-09-21

**Accepted for the bounded namespace guard slice HA1–HA5 and HA-DOC. H1 as a
whole remains open.** The reviewer did not implement the source or its original
tests. Reviewed source identities are recorded in
[`source-sha256.txt`](../../evidence/bootstrap-api-guard-independent-20260921/source-sha256.txt).
No production source was changed during this review.

## Source and documentation

`cmd_setup` first checks the namespace collection command's exit status. Only a
successful JSON `v1` List or NamespaceList containing zero or one correctly named
Namespace can proceed. A valid empty list creates the namespace; a valid existing
namespace is preserved. Failure, malformed JSON, unexpected list shape and wrong
identity stop before creation and Helm. There is no `--ignore-not-found` fallback
or diagnostic substring matching in this namespace lookup. Failed creation also
stops the actual entry point through its existing `set -e` behavior. This is a
small direct change; it does not add a general resource abstraction or retries.

The setup guide accurately records the new namespace **list** permission despite
the field selector, the existing-cluster prerequisite, CLI dependencies, safe
reruns and lack of rollback. It distinguishes host installation and recovery
from namespace setup, and describes the limits of fixture evidence. The earlier
“from scratch” script description has been corrected.

Generic `is_not_found_error` remains used elsewhere in the deploy script,
including Helm-release and Secret handling. This review accepts removal of that
path from this namespace decision only. It does not certify those other paths,
full `all` orchestration, the host bootstrap, or all API-failure handling.

## Independently executed evidence

All evidence is under
[`bootstrap-api-guard-independent-20260921`](../../evidence/bootstrap-api-guard-independent-20260921/).

- Original test file: **14/14 pass**, no skips, in `original-tests.txt`.
  `bash -n scripts/deploy.sh` also passed.
- `adversarial.py` executes isolated copies of the full original deploy script
  with CLI fixtures. **11 original scenarios pass**: a nonzero command with valid
  empty JSON on stdout; a nonzero command with valid present JSON on stdout;
  wrong namespace identity; duplicate identities; wrong collection kind;
  wrong API version; wrong item kind; non-array items; null root; and a present
  namespace under each supported collection kind. Failures permit only the
  lookup command. Existing namespaces continue without creation.
- The same independent no-mutation oracle detects **four isolated mutants**:
  suppressing command exit status; accepting a wrong identity; accepting
  duplicate identities; and accepting a wrong collection kind. Their executions
  actually continue to mutation/Helm, violating the original oracle; their
  source hashes and command traces are retained in `adversarial.txt`. Shared
  production files were never mutated.
- `actual-client.py` executes the original repository deploy entry point with
  the installed actual kubectl client and a local HTTP API fixture. **5/5 cases
  pass**: an empty list produces one namespace POST then Helm; an existing
  namespace produces no POST; a wrong-name result and HTTP 404/403 each produce
  neither POST nor Helm. Requests include the exact namespace field selector.
  The POST's actual protobuf bytes and content type are retained, and the
  fixture responds with a Namespace object. Helm itself is a CLI fixture.
- The author's smaller actual-client empty-list/404 probe was rerun successfully
  (`original-client-probe.txt`). Client version is separately recorded.

The first independent API fixture attempted to decode kubectl's create request
as JSON and failed because the actual client sent protobuf. That failed attempt
is retained as `actual-client-initial-fixture-failure.txt`. The corrected fixture
records the original bytes without interpreting them as JSON. The final five-case
run is in `actual-client.txt`; no product code or command was adjusted to make it
pass.

These are real shell and client executions with explicitly simulated command/API
peers. They do not establish Kubernetes authorization, admission, API availability,
host readiness, real namespace persistence, or restoration. No finding-register
status was changed and no full H1 acceptance is claimed.
