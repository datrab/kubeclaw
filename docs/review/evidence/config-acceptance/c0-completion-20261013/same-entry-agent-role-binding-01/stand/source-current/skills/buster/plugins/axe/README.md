# Axe Accessibility Provider

`kubeclaw.axe@1` runs Axe in a real browser against declared routes. The
provider supports Chromium, Firefox, and WebKit through the brokered
`browser.axe` capability. It does not receive browser executables or network
authority directly.

Operator policy controls browser engines, exact origins, time limits, result
limits, and browser isolation. Exact temporary acceptances require a rule,
route, selector, reason, and expiry date. Numeric violation thresholds are not
supported.

Run the available real-browser verification with:

```bash
npm test --prefix skills/buster/plugins/axe
```

The production preflight runs all three browser engines before production
acceptance can complete.

