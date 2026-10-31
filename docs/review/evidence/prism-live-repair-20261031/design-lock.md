# Prism production repair — reference lock

Direct production repair of the existing tool, not replacement of the user's designs.
Primary: Linear Changelog (Refero 11d3e58a-87d7-4a9a-bbf5-720f4fd3ffc6, https://linear.app/changelog): graphite layering, compact 12–14px tool typography, quiet borders, readable muted copy. Preserve separation and dark chrome; no marketing display type.
Secondary: Framer editor (Refero fad0285e-dcc9-4d40-8df6-e718e6d7b565, https://refero.design/pages/fad0285e-dcc9-4d40-8df6-e718e6d7b565): the actual design is the central visual, device dimensions belong to the scrollable canvas, properties and navigation stay peripheral.
Secondary: Editor X (14de8ffb-7140-4d73-ad7f-94e8befaff75): grouped properties, separate preview and editing actions. Figma style d570f865-57a7-4fca-9968-ce59056a35dc contributes content-first hierarchy only, not its white canvas or violet actions. Full styles reviewed for all three sources.

| Decision | Evidence/role | Implementation |
| --- | --- | --- |
| Dark neutral chrome | Linear; existing Prism brand | #08090a canvas, #141516 panels, #f7f8f8 primary text |
| Orange only functional | Existing Prism identity | Primary actions, selection, focus only |
| Preview dominates | Framer/Editor X workspace references | Bounded sidebars; centered design canvas; collapsed brief |
| Responsive controls | User's explicit mobile failure | No document overflow; compact canvas fits available width; scroll confined to workspace |
| Actual design renders | Live CSP violations | Permit styles; hash only trusted selection script; retain sandbox and prohibit arbitrary inline scripts |
| Local/system typography | Runtime isolation/privacy | No remote font stylesheet request |
| Media | Existing generated FamilyClaw documents | Render actual document colors/layout/assets; no fake mockup imagery |

Reject: raw architecture taking over the page, unstyled white preview, full-width stacked direction actions, page-level horizontal scrolling, passing CI mistaken for deployment.

## Mobile comparison and change feedback — Raven, 2026-10-31

Keep the established Linear/Framer chrome and original three documents. Direct-build interaction repair, not another visual direction. The user's physical screenshot is the failure reference: mobile has no direction chooser; a running request has a disabled button labelled as reconciliation instead of work.

- Framer content-first comparison + Raven's explicit goal: three numbered preview tabs and a persistent mobile “Entwürfe” entry. Viewing is a read-only document GET, never choosing/rejecting a direction.
- Bundled Refero copywriting, “context / outcome / next step”: show queued, running, applied, or retry-needed text inside the open request sheet, with an explicit target document.
- Bundled craft-details form/state guidance: disabled submit says what is running; aria-live status announces changes. A saved job automatically resumes its existing GET status stream on reload and preserves its original identity.
- Preserve: dark canvas, restrained orange active border, actual document preview. Reject hidden desktop-only choices, silent disabled actions, duplicate generation, invented progress percentages, and treating paint/layout checks as complete workflow acceptance.
