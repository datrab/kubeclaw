# Studio owning-project type corrections

This bounded follow-up resolves the six errors exposed by the real Studio TypeScript project. It does not change design-round submission, lost-response retry, subject authority, bridge execution or Control delivery.

## Causes and changes

Four errors came from `projection.ts` declaring the two Puck slot values as `unknown`. Installed `@puckeditor/core` exports `Slot<Props>` and maps that type into the callable `SlotComponent` in a component render function. Both projected values now use that actual API. The unchanged component configuration is extracted from `app.tsx` into `puck-config.tsx` so the same production components can undergo an actual Puck/React server render.

One error came from missing `initialState` in the handwritten Prism view TypeScript type. The existing JSON schema already defines the optional ID-valued property. `contracts/prism/v1/src/index.ts` now exposes `initialState?: string`; the JSON schema and generated validator remain unchanged.

The remaining error was a direct dereference of deliberately unknown `document.flows` values. `studio/flows.ts` first validates the document with the existing contract, then narrows flow locations and transitions through runtime checks. The app uses the resulting typed values for navigation and actions, removing the old flow casts. Preview messages are treated as unknown and checked before selection/action dispatch; the existing iframe source check remains. Malformed flow documents fail contract validation instead of gaining assumed fields.

## Exact source scope

- `contracts/prism/v1/src/index.ts` (one optional view property)
- `skills/prism/studio/app.tsx`
- `skills/prism/studio/projection.ts`
- New `skills/prism/studio/puck-config.tsx` and `flows.ts`
- New `skills/prism/studio/puck-render.test.tsx`
- New `skills/prism/tests/studio-flows.test.mts`

No changes to Studio's owning tsconfig, design-round-client, schema, generated validator, bridge or Control source are included.

## Evidence

`docs/review/evidence/studio-types-tests.txt` records clean Studio/contract typechecks, 50 passing tests covering the existing canonical node roundtrips, adapter, preview assets and genuine HTTP design-round retry behavior plus the new flow regressions; the original contract fixture/remediation checks pass. The actual installed Puck `Render` and ReactDOMServer render the production config and nested projected Stack/PrismBlock slots successfully (one additional test). The TSX verification entry is built with installed esbuild and executed with Node; its temporary executable is removed afterward.

The existing validator generator ran successfully and produced no diff. The real production build passed with `node_modules/.bin/vite build --config skills/prism/studio/vite.config.ts` (221 modules); its existing large-chunk warning remains. No bundler limits were changed.

Focused canonical lint passes projection, config, flow helper and new tests. `docs/review/evidence/studio-types-lint.txt` compares app.tsx with the committed baseline: the same five pre-existing errors remain, with identical rule counts. No casts, any, suppression, lint override or replacement component is used to make these errors disappear.

Native browser/editor interaction proof remains unavailable because this host lacks the required Chromium executable, as documented by the existing native Prism gate. Puck server rendering and the successful client bundle are not presented as browser interaction proof. No external services, deployment or commits were performed by this slice.
