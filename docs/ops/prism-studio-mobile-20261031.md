# Prism Studio mobile repair, 2026-10-31

Raven’s live Samsung screenshot showed the full architecture brief ahead of the canvas. The brief and quality/status blocks were extra direct children of a fixed three-column editor grid. On phones the full brief displaced the canvas; preview widths were only maximum widths, so wide previews shrank to the phone container.

The brief is now collapsed by default inside the workspace. Quality and publication status also remain in that workspace without consuming editor grid cells. Compact/regular/wide canvases use explicit 390/768/1280px widths with workspace-local horizontal scrolling. Puck is remounted on document identity/view/viewport changes to initialize its own iframe width consistently, retaining canonical document edits.

Verification: production build and Prism TypeScript check passed. Production HTTP-fixture browser suite: 20/20 passed, desktop and touch phone. The project+document regression includes a long brief, all three widths in editing and preview, actual iframe widths, quality checks, and no outer-page horizontal overflow. Existing text-save/reload, pointer reorder, conflict handling, feedback reconciliation and sandboxed preview cases passed. These are browser/API fixtures, not live Samsung acceptance.

Structured autoreview helper was attempted with `--mode local`; unavailable because the `codex` executable is absent. Manual diff review performed; no automated-clean review claimed.

Release/rollout verification is pending. No design approval, new design job, baseline publication, or FamilyClaw application deployment was performed.

A follow-up with the exact recovered Herdfeuer document exposed an initially blank Puck canvas when the document has no `home` view. View identity is now included in the Puck key; the regression uses `alltag`/`tagesfokus` and verifies rendered heading changes on desktop and mobile navigation. Mobile navigation also initializes the target view state. Exact-document local HTTP replay produced visible edit and preview captures without page errors; live deployment is still pending.
