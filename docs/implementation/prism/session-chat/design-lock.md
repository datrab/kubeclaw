# Studio session chat and explicit decisions
Target: existing deployed Prism Studio, as captured by workflow-live-phone-layout-{1,2,3}.png. Direct build, no visual redesign.
References: existing Studio direction tabs/mobile sheet; Refero craft-details (forms, touch targets, focus); user requirements from 2026-10-31.
Preserve dark chrome, compact preview-first structure, orange primary actions and current design tokens. No new decorative assets.
Decisions: tabs only preview; adjacent named confirmation button explicitly selects the previewed design (not production publication); selection/rejection store project-scoped explicit direction evidence, never infer all constituent traits. Ordinary chat stores conversation only, not preference events. Explicit preference button is separate.
Chat routing: resolve the immutable originating design-round agent job from document ownership in Control. Copy its exact session key; no browser-supplied key, no recomputation, no fallback session. Serialize all chat/revision/design work on the same durable session queue. Persist message identity and reply, never replay an uncertain launched turn.
Quality: readable functional findings with element labels; review acknowledgement remains explicit and does not claim visual approval.

Checkbox follow-up: retain the existing report, show a live reviewed/total count and explicit “Geprüft — nicht behoben” state. Review acknowledgements are local to the current evaluation; never emit preference, direction selection or repair requests. Explain the next step via the existing Prism chat and re-evaluation. Static responses require cache revalidation so reload picks up the current hashed application bundle.
