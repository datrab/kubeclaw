# Pipeline Simplification Step 5 Changelog

Batch: low-risk deletion.

Changes:
- Deleted the `resolveModel` wrapper from `core/config.ts`.
- Moved remaining live callers to `resolvePolicy(...).model`.
- Removed Forge and generic ACP literal agent-id fallbacks.
- Updated active docs/maps that described the removed wrapper.
- Added guards for the removed ACP fallback literals.

Proof:
- `rg "function resolveModel|import \\{[^}]*resolveModel|deps\\.resolveModel|resolveModel:" skills tests`
- `rg "\\|\\| 'forge'|\\|\\| agentType" skills/nova/pipeline/agents/orchestration.ts skills/nova/pipeline/runners/module-runner-forge.ts`
