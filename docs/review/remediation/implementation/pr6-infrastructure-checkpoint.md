# Remaining-23 infrastructure checkpoint

Scope is D15 (all 23 remaining findings), with the Buster fixture lifecycle
decision accepted as D14. Work continues in PR #6. No deployment, live cluster
mutation or operational cleanup has been performed.

Private access corrections and their live-gate instructions are recorded in
`pr6-private-access.md`; the partial Redis change is in `pr6-redis-durability.md`.
The combined original Helm, nginx, Redis, HTTP/MCP and installed Codex CLI suite
passes **14 tests, zero failures and zero skips**. Raw output:
`../../evidence/pr6-infrastructure/access-native.txt`.

The explicit command uses `HELM`, `ARCHVIEWER_TEST_NGINX` and `REDIS_SERVER` to
select real local binaries, then runs:

```sh
node --test tests/verification/contracts/infra-private-access.test.mjs \
  tests/verification/reliability/archviewer-native.test.mjs \
  tests/verification/reliability/redis-durability.test.mts \
  tools/ops-mcp/test/authentication.test.mjs \
  tools/ops-mcp/test/http.test.mjs tools/ops-mcp/test/local.test.mjs \
  ops/pod/test/deployment.test.mjs
```

Local tools: Helm 3.18.4, nginx 1.29.0 compiled from upstream source, Redis 7.2.7,
and the Ops package's installed, locked Codex CLI 0.153.4. These are native
behavior checks, not execution of the selected production images. The broader
Ops regression initially lacked the pinned CLI installation; `npm ci` from the
unchanged Ops lock installed it and all five Ops Pod tests then passed. Initial
nginx test setup was corrected to avoid its reserved NGINX environment variable,
use an available local UID and expect nginx's actual missing-file 403 response.

New authentication/configuration modules, the unchanged publisher behavior with
its exported Lua, and the live verification entry pass canonical lint. Existing
monolithic Ops server lint debt is not erased or reported as a green full-server
lint result. Environment reads added by this package are explicit configuration
boundaries. The separate Ops Pod supplies its already authorized namespace list
to the shared backend so its platform observer behavior remains available.

Worker Core/Prism/Buster integration and full cross-store retirement remain
unfinished. This checkpoint does not establish completion of all 23 findings or
eight hours of work.
