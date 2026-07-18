# Documentation Handoff Checklist

Status: current
Audience: maintainers, documentation contributors

Use this checklist when continuing documentation work:

1. Read `docs/README.md`, `DOCUMENTATION_PLAN.md`, `DOCUMENTATION_AUDIT.md`, and the page being changed.
2. Inspect the canonical source and focused verification named by that page.
3. Check `git status --short` before editing so unrelated work is preserved.
4. Replace obsolete claims directly; do not retain a resolved-history section.
5. Update related indexes, examples, diagrams, generated inventory, open issues, or roadmap entries only when their current truth changes.
6. Run `npm run docs:check` and the focused protected-claim verifier.
7. Hand off the exact pages changed, claims verified, commands run, and any remaining live-only uncertainty.

Do not treat archived reviews, old plans, ignored local artifacts, or conversation history as current source authority.
