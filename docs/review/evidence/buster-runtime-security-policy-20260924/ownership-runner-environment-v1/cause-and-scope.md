# Independent nested runner environment

The first failed ownership run produced Node’s real warning: `node:test run() is being called recursively within a test file. skipping running files.` The nested runner inherited NODE_TEST_CONTEXT from the outer node:test worker and therefore never executed the scenario. No child/barrier/reporter evidence existed; this is a setup failure, not an ownership result.

The proposed one-file correction copies the outer environment, sets only the two existing explicit scenario bindings, and removes only NODE_TEST_CONTEXT for the intentionally independent `node --test` runner. NODE_OPTIONS and all actual tool/trace/mutation bindings stay byte-for-byte inherited. The independent runner itself supplies its own worker context to its scenario workers normally. No test assertion, source helper, clock bound or failure oracle changes.

No Node runtime or test was launched by this author while root session25339 remains active. The retained stderr is the observed diagnostic; no inspection of Node internals or passing behavior is claimed. Root must rerun the unweakened gate after source review and integration.
