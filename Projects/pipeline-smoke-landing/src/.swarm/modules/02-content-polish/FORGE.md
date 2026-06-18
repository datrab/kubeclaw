# Module 02 — Content And Responsive Polish

## Goal

Extend the landing page with a second section that explains the pipeline gates
being exercised, and tighten the responsive visual design.

## Acceptance Criteria

- Keep all Module 01 behavior working.
- Add a second section with `id="pipeline-flow"` and `data-module="02-content-polish"`.
- The second section visibly describes this smoke-test flow:
  - Forge plus Buster
  - review gates
  - Forge-only module
  - final Buster and final review
- Improve the responsive layout so the page is comfortable at:
  - narrow mobile width
  - tablet width
  - desktop width
- Keep the design restrained and lightweight.
- Avoid external fonts, image CDNs, analytics, and runtime dependencies.
- Update unit tests so `npm test` proves the second section exists.

## Architecture Constraints

- Preserve the plain Node.js architecture.
- Keep CSS maintainable and directly related to the page.
- Do not create the Kubernetes manifest in this module.
- Do not add approval-gate or Tailscale behavior.

## Files To Produce

| File | Purpose |
|---|---|
| `src/page.js` | add the second section and responsive refinements |
| `test/page.test.js` | extend page assertions for the second section |
| `README.md` | short local run instructions if missing or incomplete |

## Unit Tests (node:test)

Extend the existing tests with these cases:

| File | What it tests |
|---|---|
| `test/page.test.js` | `renderPage()` includes `id="pipeline-flow"`, `data-module="02-content-polish"`, and copy for final Buster/final review. |

