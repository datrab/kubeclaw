# Plugin packages

This directory is the canonical ownership root for shared self-contained plugin
packages. Nova-owned packages live in `skills/nova/plugins`; Buster-owned
packages live in `skills/buster/plugins`. Bundle assembly overlays the selected
role root with this Common root at `/app/skills/plugins`.

A v2 package is recognized only by an inert `plugin.json` declaring `pipeline-plugin-v2`. It owns its implementation, schemas, prompts, tests, fixtures, documentation, and private dependencies. It may import `@kubeclaw/plugin-sdk` and declared ordinary libraries, but never core internals or sibling plugin internals.

Existing packages without a v2 manifest remain inventory-tracked migration sources. They do not receive v2 status or exemptions automatically.
