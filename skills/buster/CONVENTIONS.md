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

Persistent tests (for e2e.ts discovery): `*.spec.js` or `*.test.js` in `.swarm/<module>/tests/`.

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

## Runtime Rules

- Do **NOT** build images, deploy workloads, or clean namespace leases — the Buster Pipeline handles that
- The app is already running (URL is in Pre-Test Results)
- Test scripts run in the Buster pipeline sidecar; application workloads run only in leased namespaces
- Place test scripts and output artifacts under `.swarm/`; Buster Pipeline runs verify-task.ts before completion emission

---

## Cleanup

- Close open browser instances (Playwright: `browser.close()`)
- Close WebSocket connections
- k6 terminates on its own
- Temp files in `/tmp/` are OK (deleted at task end)

---

## Browser Testing

Use Playwright against the sandbox Chromium install for browser testing inside the sandbox.

### Common patterns

Use Playwright when you need deterministic browser checks: rendered text, click flows, console/runtime errors, screenshots, and regression assertions.

Useful tactics:

- capture `page.on('console', ...)` and `page.on('pageerror', ...)` before navigation
- use `page.locator(...)` plus `expect(...)` for stable assertions
- save screenshots when layout or rendering is part of the check
- keep one-off repro scripts small and delete them when they are no longer useful

### Checking for JS errors

After navigating to a page, always inspect Playwright `console` and `pageerror` events to surface React crashes, undefined-property accesses, and other runtime failures that may not be visible in the UI.

```bash
node - <<'EOF'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  console.log(await page.locator('body').innerText());
  await page.screenshot({ path: '/tmp/dashboard.png', fullPage: true });
  await browser.close();
})();
EOF
```

---

## Subagent Workflow Order

1. Read Pre-Test Results (in prompt — JSON)
2. Memory recall for known bugs
3. Read BUSTER.md — note all checks
4. Execute each check sequentially and log
5. Write only the prompt-provided `output_file`
   - for `module_test` and `gate_test`, write raw, directly parseable JSON to `output_file`; do not wrap it in Markdown, do not use fenced code blocks, and do not include explanatory text outside the JSON object
   - for `module_test`, use the prompt-provided schema with `artifact_type: "buster_output"`, `status: PASS|FAIL`, `summary`, and `completed_at`
   - for `gate_test`, use the prompt-provided schema with `status: PASS|FAIL`, `summary`, and `findings`
   - do NOT run verify-task.ts yourself; Buster Pipeline runs it before Redis completion emission
   - do NOT edit `status.json` or any orchestrator state file; Nova owns lifecycle mutation and retry accounting
   - do NOT mutate `.fail_count`, `.fail_summaries`, `current_phase`, `phase_started_at`, or `completed_at`
6. Store findings in memory
7. Stop after `output_file` is written. Do not call Redis completion tools; `buster-pipeline.ts` owns verify/push and completion emission.
