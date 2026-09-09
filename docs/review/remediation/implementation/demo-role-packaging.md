# Demo handoff role packaging — Welle47

Original role validation on base `a8cf34f` failed with `nova omits its plugin: kubeclaw.demo-handoff`. Both newly implemented product pieces were absent from their actual role manifests: Nova's `kubeclaw.demo-handoff` and Buster's `kubeclaw.demo-auth-smoke`. A source checkout could validate a demo graph while the declared production bundle omitted its implementation.

Added each existing plugin to its owning role's `plugins` list. Existing package ownership and dependency declarations remain authoritative: the original bundle builder includes the complete plugin tree and resolves its real declared dependencies. No source copy, alternate plugin or package shim was added.

Validation from `/workspace/scratch/0d8f8ddb55c3/wave47-product`, logs under `/tmp/kubeclaw-wave47-product/`:

- Original `node scripts/check-runtime-role-manifests.mjs`: exit 0 after the two additions (`role-manifests.log`). It enumerates all owned registered plugins, so no count assertion was weakened.
- Actual native isolation helper built first with `npm run plugin-system:sandbox:build`: exit 0 (`sandbox-build.log`).
- Original `node scripts/build-runtime-role-bundle.mjs nova <output> <base-sha> v2 <timestamp>` and corresponding Buster command: exit 0 (`bundle-build-final.log`, `buster-bundle.log`). The base SHA identifies the checkout baseline; these were dirty-worktree builds, with exact copied source hashes recorded by the builder, not released images.
- Native Node imports from those actual bundles outside the repository: Nova candidate, delivery, Ready stage and adapter; Buster demo-auth provider. All original exports resolve with actual packaged dependencies (`bundled-demo-imports.log`), exit 0. No adapter/provider function is invoked and no successful login/build/deployment is inferred.
- The original two-module Project CLI/compiler regression, including the new legacy-authoring checks, also passes against the actual archived/extracted Nova bundle (`import-bundle.log`), exit 0. Executed pipeline stages: zero.

This closes the concrete role-manifest omission in product composition. It does not close F-T14's required real authenticated application, tailnet reachability, expired-generation denial, operator receipt, human acceptance or extension integration. Those operational/code boundaries are separately listed in `wave47-product-gates.md`.
