# PR #6: complete Knip execution

The full repository Knip command now exits 0 with Knip 6.27.0. This closes the
missing static gate within PCR-SDK-001, not the finding's native semantic,
producer or historical-consumer acceptance. No finding status/count changed.
The marked semantic helper was not run or rerouted.

Direct dependencies now belong to the packages importing them: root YAML and
Playwright tests, Buster's Chrome launcher and Playwright fixtures, and Review's
native tokenizer tests. Existing locked package versions and platform libc
constraints are preserved. Axe's unused SDK dependency and genuinely unreferenced
lint/review helpers were removed. Revalidation identity validation was extracted
without changing its conditions to satisfy the existing complexity limit.

The generated Knip graph now includes real Prism native tests, generated contract
declarations, type-only contract tests, Ops MCP, the Puck adapter spike, canonical
ESLint configuration, and fixture manifest entrypoints. The worker resource schema
generator is exposed through package scripts including its original --check mode.
No source directories were removed from analysis. The fixed Kubernetes executable
path is excluded only from unresolved module imports. Puck's react-dom and
@types/react-dom are scoped peer exceptions: its locked transitive @tiptap/react
and Radix packages require them even though the adapter never imports DOM modules.

Reproduction requires the independently locked packages to be installed as well:

```sh
npm ci --ignore-scripts
npm ci --prefix tools/ops-mcp --ignore-scripts
npm ci --prefix spikes/prism/puck-adapter --ignore-scripts
npm run knip:check
```

The PR workflow now contains this static job. The previous native workflow run
34684977699 ended before its first step: supervisor, studio and inputs had
steps:null, with PostgreSQL skipped. No native result or cause is inferred from
that failure; no repeated rerun was requested.

Local evidence: `docs/review/evidence/pr6-knip/`. Full Knip, canonical ESLint of
changed JavaScript/TypeScript, both affected package builds, original Review
revalidation/context suites, original Lint stage and package boundary suites pass.
The Lint suites require their package working directory; an initial root-directory
invocation failed module resolution and was corrected. Native/browser/cluster
acceptance remains separate.
