# Architecture Validation Report

**Project:** pipeline-smoke-landing
**Timestamp:** 2026-06-18T21:12:37.934Z
**Result:** PASS

## Summary

| Severity | Count |
|----------|-------|
| blocking | 0 |
| error    | 0 |
| warn     | 1 |
| info     | 0 |
| **total**| **1** |

## Findings

### [WARN] `AGENT_JUDGMENT_SKIPPED`
**Scope:** project
**Issue:** Architecture validator agent call failed: Gateway complete failed: 404 Not Found
**Fix:** Verify gateway is reachable and arch_validator model is configured. Proceed manually if blocked.
