# Prism Design Document v1 Simplification Review

Status: accepted review result
Date: 2026-08-12
## Purpose

Test the proposed Design Document v1 model against three complete experience types:

1. Web authentication.
2. Dense application dashboard.
3. TUI setup flow.

The review asks four questions:

- Can the model describe each experience without custom code?
- Does one concept have two competing representations?
- Is a proposed property not required by any fixture?
- Is an important experience impossible or awkward to express?

## Result

The six-section document model is sufficient:

```text
meta
theme
assets
components
views
flows
```

The common node shape is also sufficient:

```text
id
type
props
children
```

No new top-level section is required. No script, expression language, arbitrary CSS,
or second layout model is required.

The proposed property catalog is useful, but it is larger than v1 needs. This review
reduces the initial renderer catalog and corrects five contract details.

## Accepted Corrections

### 1. Keep references explicit

Use small reference objects instead of strings with special prefixes.

```json
{ "token": "space.medium" }
{ "data": "user.name" }
{ "asset": "product-logo" }
{ "action": "submit-sign-in" }
```

This is easier to validate than values such as `$space.medium` or `$data`.

### 2. Put action identity on transitions

An interactive node has an `action` value. A flow transition uses the same value as
its trigger. The transition ID is separate and only identifies that transition.

```json
{
  "id": "sign-in-success",
  "from": { "view": "sign-in", "state": "submitting" },
  "trigger": { "actor": "system", "action": "authentication-succeeded" },
  "to": { "view": "dashboard", "state": "default" }
}
```

This avoids coupling a node to one transition ID. One action can have success and
failure results.

### 3. Put patches directly under node IDs

A patch already targets node properties. Do not add a second `props` wrapper.

```json
{
  "submit-button": {
    "label": "Signing in...",
    "disabled": true
  }
}
```

Patches cannot change `id`, `type`, or `children`.

### 4. Keep data binding small but useful

A scalar value can use one data reference:

```json
{ "data": "user.name" }
```

Lists and tables can give one item object to a reusable component. Dot paths can read
fields from that local item. V1 has no formulas, filters, loops, or conditions.

### 5. Do not put responsive behavior in two places

The theme declares only three breakpoint names and their minimum widths. Views own
all responsive changes through patches.

Layout nodes do not have fields such as `collapse`. A responsive patch changes a
split direction or grid column count instead.

## Initial V1 Renderer Catalog

The three fixtures require these node types:

### Layout

- `stack`
- `grid`
- `split`
- `scroll`
- `overlay`

### Content

- `text`
- `heading`
- `image`
- `icon`
- `divider`
- `code`

### Input

- `button`
- `link`
- `text-input`
- `select`
- `checkbox`

### Data

- `list`
- `table`
- `badge`
- `progress`
- `chart`

### Navigation

- `navigation`
- `tabs`
- `breadcrumb`
- `pagination`

### Feedback

- `alert`
- `dialog`
- `toast`
- `tooltip`
- `empty-state`
- `spinner`

### Reuse and terminal

- `component`
- `terminal`
- `command`
- `prompt`
- `output`

## Deferred Node Types

These types are valid future additions, but the fixtures do not justify them in the
initial renderer:

- `text-area`
- `radio`
- `toggle`

They do not require Design Document v2 when later added. Each only needs a strict
renderer property schema and capability test.

## Shared Properties Review

Keep:

- `hidden`
- `width`
- `height`
- `minWidth`
- `maxWidth`
- `minHeight`
- `maxHeight`
- `padding`
- `background`
- `foreground`
- `radius`
- `border`
- `opacity`
- `accessibilityLabel`
- `accessibilityDescription`

Do not add:

- margin;
- CSS class or selector;
- arbitrary style object;
- absolute position;
- z-index;
- transform;
- custom JavaScript.

The fixture documents do not use every shared property. They remain accepted because
they provide bounded cross-type needs such as modal sizing, readable line length,
minimum touch size, visual hiding, and accessibility labels. They replace arbitrary
CSS rather than adding parallel complexity.

## Fixture Findings

### Web authentication

The model expresses:

- sign-in, password recovery, and dashboard destinations;
- default, submitting, and error states;
- user actions and separate system outcomes;
- form controls and a modal confirmation;
- compact and wide layout changes;
- deterministic user data.

No missing schema concept was found.

### Dense dashboard

The model expresses:

- navigation, summary metrics, chart, table, filtering, pagination, and details;
- loading, populated, empty, and error states;
- desktop and compact layouts;
- reusable status components and row actions;
- deterministic collections.

A simple table must remain intentionally limited. Rich interactive rows use `list`
and a reusable component. This is simpler than adding cell render functions.

### TUI setup

The model expresses:

- terminal dimensions and theme;
- commands, prompts, outputs, progress, and confirmation;
- choice, validation failure, retry, and completion paths;
- user and system actions without command execution.

The `terminal` node is a visual frame. `command` content is display-only. The mock
runtime changes state only through declared flow transitions.

## Final Decision

Accept the v1 property model with the five corrections in this document.

Freeze the initial catalog only after machine-valid fixtures exist for all three
experience types. The future JSON Schema and renderer catalog must reject unknown
fields and prove the same cross-reference rules.

This review closes the conceptual Design Document schema decision. The remaining
implementation artifact is the exact JSON Schema plus renderer-type schemas and
machine-valid fixtures. That work belongs to the build plan, not to a new architecture
decision.
