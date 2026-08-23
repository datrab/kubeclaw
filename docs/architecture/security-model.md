# Plugin Security Model

Trusted first-party packages are imported only after inert discovery, schema
validation, content-digest verification, and import-side-effect auditing.
Restricted external packages are installed transactionally and execute through
`skills/common/plugin-runtime/foundation/isolation/runner.ts`.

Security invariants:

- trust roots and grants are operator-owned;
- each invocation receives only registration-specific capabilities;
- secrets are resolved through a capability and are redacted from journals;
- filesystem, network, command, environment, time, and resource boundaries are
  enforced for restricted packages;
- failed installation or activation leaves no partial package state;
- cancellation and crashes are contained at the registration boundary;
- only core commits lifecycle transitions.

Run the malicious-package and isolation suite with:

```bash
npm run verify:plugin-system:phase11
```
