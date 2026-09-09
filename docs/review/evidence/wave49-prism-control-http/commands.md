# Commands

Executed in isolated worktree rooted at commit `147a9e0`, with the package's
source changes visible. Node 24 toolchain directory was prepended to PATH.

```sh
node --test skills/prism/tests/control-generation-http.test.mts skills/prism/tests/preferences-generation.test.mts skills/prism/tests/pipeline-preference-subject.test.mts skills/prism/tests/design-rounds.test.mts skills/prism/tests/design-round-client.test.mts skills/prism/tests/agent-jobs.test.mts skills/prism/tests/preference-bridge.test.mjs
npm run typecheck -w @kubeclaw/prism
node tests/verification/contracts/check-deploy-prism-command.mts
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/server/control.ts skills/prism/server/control-server.ts skills/prism/tests/control-generation-http.test.mts
git show 147a9e0:skills/prism/server/control.ts | node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs --stdin --stdin-filename skills/prism/server/control.ts
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/tests/control-generation-http.test.mts skills/prism/server/agent-prompt.d.mts skills/prism/openclaw-plugin/index.d.mts
node --test skills/prism/tests/control-server-config.test.mts
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/server/control.ts skills/prism/server/control-config.ts skills/prism/server/control-server.ts
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/server/control.ts skills/prism/server/control-config.ts skills/prism/tests/control-server-config.test.mts skills/prism/tests/control-generation-http.test.mts skills/prism/server/agent-prompt.d.mts skills/prism/openclaw-plugin/index.d.mts
```

Full Control lint is diagnostic and nonzero; no full lint pass is claimed.
Focused new-module lint passes. The deployment contract is also run in a
separate unchanged worktree at `147a9e0`; both versions fail at the same earlier
schema-prompt location assertion (see implementation note). No deployments,
CI runs, model calls, paid resources, production data or external recipients.
