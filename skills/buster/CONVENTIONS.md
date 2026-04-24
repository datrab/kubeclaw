# Buster — Conventions for the Subagent

This document defines how the Buster subagent operates. It is used as a reference in the prompt or as a workspace doc.

---

## Output Format

Every test script outputs **JSON** to stdout. No Markdown, no free text.

```json
{
  "total": 5,
  "passed": 4,
  "failed": 1,
  "results": [
    {
      "name": "GET /api/health returns 200",
      "passed": true
    },
    {
      "name": "POST invalid body returns 400",
      "passed": false,
      "actual": "500",
      "expected": "400"
    }
  ]
}
```

---

## Naming

Test files: `test-<suite>-<module>-<attempt>.js`

Examples:
- `test-api-02-1.js` — API tests for module 02, first attempt
- `test-e2e-15-2.js` — E2E tests for module 15, second attempt
- `test-ws-06-1.js` — WebSocket tests for module 06

Persistent tests (for e2e.js discovery): `*.spec.js` or `*.test.js` in `.swarm/<module>/tests/`.

---

## Timeouts

Every request and every script has a timeout. No test may run indefinitely.

| Context | Timeout |
|---|---|
| HTTP request (fetch) | 5-10s |
| WebSocket connect | 5s |
| WebSocket response wait | 5s |
| Playwright navigation | 15s |
| Playwright full run | 60s |
| k6 full run | 120s |
| Single test script | 120s |

When a timeout is reached: report ERROR, do not wait indefinitely.

---

## Error Reporting

Every bug report contains:

1. **Repro Steps** — Exact steps to reproduce (request, input, action)
2. **Actual** — What actually happened (status code, response body, error message)
3. **Expected** — What was expected
4. **Environment** — URL, port, module, commit hash
5. **Severity** — critical / serious / moderate / minor

No "it seems broken". Exact data.

---

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | PASS — All tests passed |
| 1 | FAIL — At least one test failed |
| 2 | ERROR — Script error, timeout, configuration problem |

---

## Sandbox Rules

- Do **NOT** run `sandbox-build`, `sandbox-serve` or `sandbox-cleanup` — the Buster Pipeline handles that
- The app is already running (URL is in Pre-Test Results)
- Test scripts run inside the container, not in the sandbox
- Place results in `.swarm/<module>/` (verify-task.js enforces scope)

---

## Cleanup

- Close open browser instances (Playwright: `browser.close()`)
- Close WebSocket connections
- k6 terminates on its own
- Temp files in `/tmp/` are OK (deleted at task end)

---

## Browser Testing

`agent-browser` is the primary tool for interactive browser testing inside the sandbox.

### Common commands

| Command | Description |
|---|---|
| `agent-browser open <url>` | Navigate to a URL |
| `agent-browser snapshot -i` | Print accessible element tree (for finding selectors) |
| `agent-browser click <selector>` | Click an element |
| `agent-browser fill <selector> <value>` | Fill an input field |
| `agent-browser get <selector>` | Get element text/value |
| `agent-browser wait <selector>` | Wait for element to appear |
| `agent-browser errors` | List JS runtime errors (React crashes, undefined access) |
| `agent-browser console` | Show browser console output |
| `agent-browser screenshot` | Capture a screenshot |
| `agent-browser diff <baseline>` | Visual diff against a baseline image |
| `agent-browser eval <js>` | Evaluate JavaScript in the page context |

### When to use agent-browser vs Playwright

- **agent-browser** — preferred for interactive exploration: checking what rendered, clicking around, inspecting errors, verifying visible text. No script required.
- **Playwright** — use when you need deterministic programmatic scripting: loops, complex assertions, multi-step flows that must be reproducible as a `.spec.js` test.

### Checking for JS errors

After navigating to a page, always run `agent-browser errors` to surface React crashes, undefined-property accesses, and other runtime failures that may not be visible in the UI.

```bash
agent-browser open http://localhost:3000/dashboard
agent-browser errors       # any React or JS errors?
agent-browser console      # any console.error / warnings?
agent-browser snapshot -i  # inspect rendered elements
```

---

## Subagent Workflow Order

1. Read Pre-Test Results (in prompt — JSON)
2. Memory recall for known bugs
3. Read BUSTER.md — note all checks
4. Execute each check sequentially and log
5. Update `status.json` using the exact canonical completion protocol from the prompt
   - use the prompt-provided lifecycle update command as written
   - do NOT invent alternate lifecycle mutations or retry accounting
   - do NOT mutate `.fail_count` or `.fail_summaries`
6. Store findings in memory
7. `redis.js --action complete` as last command
