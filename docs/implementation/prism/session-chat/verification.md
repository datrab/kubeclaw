# Verification

- `npm run typecheck --prefix skills/prism` plus `tsc --noEmit -p skills/prism/studio/tsconfig.json` and production Studio build pass. The standalone Studio config is a separate required check; CI caught missing optional-props handling, now corrected and reviewed.
- Studio production/CSP HTTP-fixture browser suite: 32/32 pass (mobile + desktop). Chat regression also renames the active view and verifies the returned revision still renders; explicit preference action is exercised separately.
- Real PGlite migrations and durable queue tests: exact persisted origin session (deliberately different from derivation), missing-origin rejection, idempotent message admission, scoped history, no implicit preference rows, no replay of a running turn.
- Original Control HTTP + actual OpenClaw-plugin route tests: authenticated admission, exact originating session, foreign target/stale fence rejection, fenced chat revision commit, durable reply, stale-preview rejection, explicit revised-design selection. Actual agent image COPY relocation imports the launcher and its implementation-profile files.
- Existing queue/decision regressions: 13 pass. Additional process/resource/bridge/plugin tests passed; original Control HTTP tests require `NODE_ENV=test` in this production-configured shell.
- Review fixes: confirm displayed (not refetched unseen) revision; retry transient preview refresh; retain locally acknowledged turns across stale GET; buffer stdout before UTF-8 decoding; include chat-reply in agent image.
- Prior review claim that renamed views break refresh was rejected after inspecting derived `viewId`/`viewState` fallbacks; browser regression exercises the invariant.

Publication and actual same-session live chat acceptance are required before declaring ready. Fixture replies are not model/session-delivery proof.
