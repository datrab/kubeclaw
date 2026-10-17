# Prism Studio Interaction v1

Status: accepted architecture contract

## Product goal

Studio helps a non-designer choose, compose, refine, test, and approve a complete
experience. V1 includes full constrained visual editing on desktop, tablet, and
mobile.

```text
Directions
  -> visual composition
  -> interactive preview
  -> review
  -> explicit approval
```

Users can tell Prism what to change or change the Design Document directly. Both
paths produce the same typed operations and immutable revisions.

## Reference direction

Studio adapts:

- Framer's separation of canvas editing, interaction preview, and breakpoint testing;
- Puck's declared React components, controlled fields, drop zones, iframe preview,
  permissions, and portable structured data.

Studio rejects a general vector tool, arbitrary CSS editor, production code editor,
and unconstrained browser-DOM mutation.

Puck is the accepted v1 editor foundation subject to an implementation spike. It is
an adapter, not the canonical domain model:

```text
Prism Design Document
  <-> tested Puck adapter
  <-> Puck editor projection
  <-> React prototype renderer
```

## One responsive application

Studio is one stateless responsive web application, not separate desktop and mobile
products.

```text
Desktop: permanent navigator + canvas + context panel
Tablet: collapsible navigator + canvas + context drawer
Mobile: canvas + compact bars + bottom sheets
```

All compositions use the same API, Design Document, component permissions, operation
catalog, revisions, renderer, review, and approval flow.

## Desktop composition

```text
┌──────────────────────────────────────────────────────────┐
│ Version · View · State · Viewport · Edit/Preview · Review│
├──────────────┬──────────────────────────┬────────────────┤
│ Screens /    │                          │ Properties /   │
│ States /     │     Visual canvas        │ Insert /       │
│ Flows /      │                          │ Prism          │
│ Components   │                          │                │
└──────────────┴──────────────────────────┴────────────────┘
```

The navigator reflects experience structure rather than exposing a generic DOM layer
tree. Detailed node structure is available only as an advanced inspection view.

## Mobile composition

```text
┌─────────────────────────┐
│ Project · View · ⋯      │
├─────────────────────────┤
│                         │
│    Prototype canvas     │
│                         │
├─────────────────────────┤
│ Navigate  Insert  Prism │
└─────────────────────────┘
```

Navigation, selection, insertion, properties, Prism, versions, review, and approval
open as bottom sheets with compact, half-height, and full-height presentations.

Mobile supports the complete workflow. It is not a read-only companion.

## Modes

### Edit

- selection and drop overlays are visible;
- inline and property editing is enabled;
- drag-and-drop and insertion are enabled;
- normal prototype navigation is paused unless explicitly activated.

### Preview

- editing overlays are hidden;
- mocked interactions and flows behave as designed;
- viewport and flow controls remain available outside the prototype;
- Escape or the mode control returns to Edit.

## Directions

Prism presents three meaningfully different directions with representative screens,
feeling, fit, trade-off, and evidence.

Primary actions are:

- Choose
- More like this
- Less like this
- Regenerate

One direction remains primary. A user can preserve one bounded detail from another
direction through an explicit instruction. Prism does not average complete directions
automatically.

Mobile shows one full-width direction at a time with explicit previous and next
controls. It does not shrink three proposals into unreadable cards.

## Visual editing scope

V1 supports:

- selecting elements;
- inline text editing;
- editing declared properties;
- inserting, deleting, duplicating, copying, and pasting components;
- drag-and-drop reorder and movement between valid regions;
- non-drag movement controls;
- component variants;
- declared resizing, spacing, and alignment;
- assets and crop treatment;
- visibility and responsive overrides;
- undo, redo, version comparison, and restore;
- natural-language editing through Prism.

V1 does not support arbitrary CSS, unrestricted z-index, transforms as layout,
freeform coordinates by default, vector drawing, handwritten production-code editing,
or direct mutation of generated DOM.

## Layout operations

Supported movement includes:

- reorder in a stack;
- move between declared slots or grid cells;
- insert before or after a node;
- wrap or unwrap nodes in a supported layout;
- change stack, grid, split, scroll, or overlay properties.

Declared sizing uses `auto`, `fill`, `fit`, bounded fixed size, grid span, and split
ratio. Absolute placement can become an explicit future Design Document layout type;
it is not the default model.

## Typed operation catalog

Every visual or agent edit maps to:

```text
node.insert
node.remove
node.duplicate
node.move
node.props.set
node.wrap
node.unwrap
component.variant.set
responsive.props.set
asset.set
operation.batch
```

Example:

```json
{
  "type": "node.move",
  "nodeId": "deployment-card",
  "fromParentId": "active-deployments",
  "toParentId": "priority-deployments",
  "index": 0,
  "baseRevision": 12
}
```

`operation.batch` makes a compound user gesture atomic. All contained operations
apply or none apply.

Puck actions are intercepted and translated into Prism operations. Prism does not
accept arbitrary Puck data as canonical input.

## Component insertion and properties

The insert catalog groups components by purpose:

- Layout
- Content
- Actions
- Inputs
- Data
- Navigation
- Feedback
- Terminal

Invalid choices are unavailable. Prism can recommend components and valid locations
from the selected region and brief.

The property panel uses product concepts rather than raw schema, CSS, or React props.
Advanced token controls remain secondary.

## Drag-and-drop

Each drag communicates valid targets, resulting parent and position, layout behavior,
and responsive scope. Invalid targets are visibly disabled.

Desktop supports pointer drag. Mobile uses long-press lift, large targets, insertion
markers, edge auto-scroll, cancel, and haptic feedback when available.

Dragging is never the only movement method. Keyboard and touch menus provide move up,
move down, before, after, into, and choose-region actions.

## Responsive editing

Studio exposes `compact`, `regular`, and `wide`.

- Structural changes apply to all viewports by default.
- Base property changes apply to the shared design.
- A viewport-only override requires explicit selection.
- Viewing compact does not silently create a compact override.

On mobile, wide designs support fit, pinch zoom, two-finger pan, focus-selection, and
landscape use.

## Mobile property and insertion behavior

Tap selects a node and shows a compact action bar. Detailed properties open in a
bottom sheet and preview live. Text commits on Done, field exit, or sheet close rather
than per keystroke.

Insertion supports both touch drag and a reliable tap path:

```text
choose component
  -> choose suggested or explicit valid location
  -> preview
  -> apply typed operation
```

## Flow testing

The navigator and mobile flow sheet show current step, success path, recovery paths,
and alternate branches. Preview interactions execute deterministic transitions.
Users can reset the flow or navigate explicitly to inspect a branch.

## Natural-language editing

The Prism panel includes current selection, instruction input, proposed affected
views and rules, and Apply or Reject. Optional browser voice input can fill the same
instruction field.

Agent and direct edits share the operation catalog. Prism always continues from the
exact current revision.

## Revisions and concurrency

Each atomic committed edit creates an immutable Design Document revision. Puck local
history provides immediate UI undo, while PostgreSQL remains authoritative.

Undoing a committed change creates a new inverse revision. Restore creates a new
revision and never deletes history.

Every operation carries `baseRevision`. Conflicts require explicit reload or rebase;
there is no silent last-write-wins behavior. This remains necessary without
multi-user editing because two tabs, agent work, and worker completions can race.

V1 does not support real-time multiplayer, presence, or shared cursors.

## Review and approval

Review uses `Ready`, `Needs attention`, and `Blocked` rather than one universal score.
It covers required screens, states, flows, responsive classes, accessibility, assets,
design consistency, unresolved decisions, and accepted limitations.

Approval identifies the exact project, Design Document revision, findings, and
limitations. Publication creates an immutable Baseline Bundle. Further edits create a
new draft and require new approval.

## Preference control

`What Prism learned` remains outside the main editor. It presents plain-language
personal and project rules with actions to confirm, limit to the project, reject as a
general preference, or forget.

## Failure and performance behavior

- Existing previews remain usable during generation.
- Worker failure preserves the last valid revision and user instruction.
- Invalid generated revisions are rejected.
- Renderer failure marks the last verified preview stale.
- Unsent mobile instructions and property fields survive temporary disconnection.
- Publication is disabled while disconnected.

Studio lazy-loads views, keeps one active canvas, uses thumbnails for navigation,
defers comparisons, bounds undo state, and uses server-generated compressed captures.
It does not run Chromium or load the full corpus in the browser.

## Accessibility

Studio supports keyboard navigation, visible focus, screen readers, reduced motion,
contrast, touch targets, non-drag movement, text descriptions of visual findings, and
zoom without losing controls.

## Required v1 proof

Desktop and mobile tests must prove that a user can insert a layout, move existing
components into it, change its ratio, duplicate and edit a component, reorder it,
apply a viewport-only override, undo and redo, reload the exact document, request an
agent edit, review findings, and publish the resulting Baseline Bundle.

The implementation spike must also prove deterministic Design Document/Puck mapping,
mobile performance, iframe isolation, selection accuracy, responsive behavior, and
operation round-trip.
