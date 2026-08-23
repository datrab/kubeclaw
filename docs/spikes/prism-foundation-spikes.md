# Prism Foundation Spikes

Status: blocked on external proof inputs; see
[Phase 0 audit](../implementation/prism/phase-0-audit.md)

## Purpose

These spikes test the four highest-risk implementation choices before production
code starts. Each spike is short, isolated, and disposable.

## Shared Studio reference lock

Primary interaction foundation:

- Puck component configuration, slots, permissions, action hooks, history, and
  viewports.

Preserve:

- owned React components;
- declared fields and permissions;
- nested valid drop regions;
- structured portable editor data;
- one clear visual canvas with bounded controls.

Borrow only:

- Framer's separation of editing from interaction preview;
- mobile bottom sheets and non-drag movement controls from the accepted Prism Studio
  contract.

Reject:

- arbitrary CSS or code editing;
- general vector tools;
- hidden responsive overrides;
- framework data as canonical Prism state;
- same-origin preview authority as the final security boundary.

Reference sources:

- <https://puckeditor.com/docs>
- <https://puckeditor.com/docs/api-reference/components/puck>
- <https://puckeditor.com/docs/api-reference/fields/slot>
- <https://puckeditor.com/docs/api-reference/permissions>
- <https://puckeditor.com/docs/integrating-puck/viewports>

## Decision ledger

| Decision | Source | Rule | Reason |
|---|---|---|---|
| Test Puck as an adapter | Puck documentation | Own components and structured fields | It can provide visual editing without becoming the Design Document |
| Use slots for valid nesting | Puck slot API | Drag only into declared regions | Prism must reject invalid structure before it becomes canonical |
| Intercept editor actions | Puck `onAction` API and Prism contract | Convert actions to typed operations | Puck state must not become canonical |
| Test mobile directly | User requirement and accepted Studio contract | Full visual editing must work on mobile | Responsive preview alone does not prove mobile authoring |
| Separate authoring from security proof | Puck iframe docs and Prism runtime contract | Built-in Puck iframe is same-origin; Prism requires opaque origin | The accepted security boundary must be proved, not assumed |
| Use exact PostgreSQL search first | pgvector documentation | Exact search gives full recall; combine with full-text search | It is the simplest v1 retrieval system |

## Spike A: Puck adapter

Status: typed adapter proof passes; real-device editor proof pending

Question:

Can Puck provide the accepted visual editing features while every canonical change is
a typed Prism operation?

Prototype scope:

- one stack, grid, split, heading, text, button, and status component;
- nested slot insertion;
- insert, remove, duplicate, move, and property edit;
- one responsive override;
- Puck `onAction` capture;
- deterministic Design Document to Puck projection;
- typed operation to new Design Document revision;
- refresh and round-trip comparison.

Pass criteria:

1. Puck actions map to the accepted operation catalog without reading arbitrary final
   Puck state as truth.
2. Unknown or invalid actions fail closed.
3. A saved and reloaded revision produces the same tree.
4. Puck permissions can disable invalid insert, move, edit, duplicate, and delete.
5. Puck remains replaceable behind the adapter.

Fail condition:

Replace Puck if ordinary editor actions cannot map deterministically, if nested slots
cannot preserve Prism layout rules, or if the required behavior depends on unstable
experimental APIs.

Measured finding:

- The spike uses `@puckeditor/core@0.23.0`.
- Five typed adapter tests pass.
- Exported Puck actions map to typed Prism insert, remove, duplicate, move, reorder,
  and property operations.
- Complete Puck-state replacement, identity changes, unknown zones, and unknown
  component types fail closed.
- Saved Design Documents round-trip without storing Puck data as canonical state.

Decision: provisional `adapt`. Puck is suitable behind a Prism adapter. It is not the
authoritative renderer or security boundary.

## Spike B: mobile editing

Status: browser-profile tests pass; real touch-device proof required

Question:

Can the same Studio support complete phone and tablet editing without a second editor?

Required test sequence:

1. Open a generated dashboard on a narrow phone.
2. Select and edit text.
3. Insert a component.
4. Move it with touch drag.
5. Move it again with the non-drag menu.
6. Duplicate and delete it.
7. Create a compact-only override.
8. Preview a wide target with pan and zoom.
9. Undo and redo.
10. Refresh and recover the same revision.
11. Ask Prism for a scoped change.
12. Review and approve the revision.

Test devices:

- narrow phone portrait;
- phone landscape;
- tablet portrait;
- touch with reduced motion;
- screen reader and keyboard alternatives where the device supports them.

Pass criteria:

- every required action works without desktop sidebars;
- drag is not required for any operation;
- scrolling does not start an accidental drag;
- the selected element stays visible when the keyboard or bottom sheet opens;
- no separate mobile document or operation model exists.

Measured finding:

- Twelve Playwright tests pass on phone portrait, phone landscape, and tablet touch
  profiles.
- The real Puck editor loads and its property editor writes the saved revision.
- Insert, duplicate, non-drag move, delete, viewport scope, and reload recovery pass.
- Movement controls have touch targets of at least 44 pixels.
- Canvas scrolling and tapping do not create an unintended editor action.

This does not replace the required real touch-device proof. No OpenClaw device node is
connected.

## Spike C: rendering isolation

Status: initial opaque-origin attack proof passes; production hardening remains

Question:

Can Prism keep rich visual editing while the rendered prototype has no Studio origin,
credentials, storage, DOM, or network authority?

Important finding:

Puck documents a same-origin iframe for viewport editing. Prism requires an
opaque-origin sandbox for the trusted prototype runtime. The built-in Puck iframe
cannot be accepted as the security boundary without additional proof.

Prototype options, in order:

1. Use Puck only for authoring projection and render the authoritative preview in a
   separate opaque-origin sandbox.
2. Use a custom Puck UI and preview bridge that sends only validated layout and action
   messages across the sandbox.
3. If neither works, replace Puck while keeping the Design Document and operation
   contracts.

Required attacks:

- script and HTML in text;
- active SVG;
- raw external URL;
- Studio cookie and storage access;
- parent DOM access;
- top navigation;
- arbitrary fetch and WebSocket;
- forged, replayed, oversized, and out-of-order messages;
- oversized node and mock-data trees.

Pass criteria:

- all attacks fail;
- element selection and drop evidence still work;
- coordinates remain runtime evidence and never become document layout;
- worker capture uses the same renderer and runtime-profile digest;
- preview failure cannot lose or mutate a revision.

Measured finding:

- Three Playwright attack tests pass in a separate `sandbox="allow-scripts"` frame.
- Script and HTML text do not execute.
- The frame cannot read parent DOM or browser storage, fetch external content, or
  navigate the parent.
- The parent validates frame source, protocol, session, and increasing sequence.
- Valid selection evidence crosses the boundary without making coordinates canonical.

Decision: use Puck for authoring and a separate opaque-origin Prism renderer for the
authoritative preview and capture.

## Spike D: PostgreSQL hybrid retrieval

Status: real benchmark harness complete; database execution pending

Question:

Can one Prism PostgreSQL database meet v1 relevance and latency requirements without
Qdrant, HNSW, or several embedding facets?

Reference sources:

- <https://www.postgresql.org/docs/current/textsearch-intro.html>
- <https://github.com/pgvector/pgvector#hybrid-search>

Prototype dataset:

- 500 hand-labelled varied references for relevance checks;
- 10,000 synthetic or permitted normalized references for the v1 load test;
- an optional 100,000-row scale probe.

Prototype query:

```text
rights and status filters
  -> PostgreSQL full-text candidate ranks
  -> exact pgvector candidate ranks
  -> Reciprocal Rank Fusion
  -> simple product and source-family caps in Prism
```

Measurements:

- precision at 10;
- recall at 10 and 20;
- result diversity;
- rights-filter correctness;
- p50 and p95 query time;
- query plan and scanned rows;
- exact duplicate behavior;
- result reproducibility.

Pass criteria for expected v1 size:

- rights filters are always correct;
- exact vector search preserves full vector recall;
- hybrid results improve or equal the better single retrieval path on the labelled
  query set;
- p95 is at most 250 ms at 10,000 corpus revisions on the selected deployment class;
- one SQL function and one combined embedding remain sufficient.

Scale-probe result does not block v1. It defines the measured trigger for HNSW, a read
replica, separate facets, or a specialized retrieval service.

Environment note:

The executable benchmark exists in `spikes/prism/postgres-retrieval`. The current pod
can reach the platform PostgreSQL Service but has no database credentials or Kubernetes
API credentials. Its system package paths are read-only, so it cannot install a local
server. No benchmark number has been invented.

## Spike closeout

Each spike ends with:

- environment and dependency versions;
- source commit;
- fixtures and commands;
- measured results;
- pass or fail;
- keep, adapt, or replace decision;
- production code and dependencies to add;
- disposable spike files to delete.

The spikes can change implementation choices. They cannot silently weaken the
accepted Design Document, mobile editing, runtime isolation, or retrieval contracts.
