# Lighthouse Provider

`kubeclaw.lighthouse@1` runs real Lighthouse audits through the brokered
`browser.lighthouse` capability. Performance, SEO, and best-practices are
separate purposes. Accessibility is excluded because `kubeclaw.axe@1` owns
that decision.

Performance uses sequential samples and selects one complete median-score
report as representative. A blocking performance node must select a named
combined budget. Operator-owned profiles control the browser, screen, network,
CPU, run, time, and result limits.

Run the real Chrome and Lighthouse verification with:

```bash
npm test --prefix skills/buster/plugins/lighthouse
```

Production acceptance uses the signed Nova-to-Buster preflight and stores a
suite-specific receipt.

