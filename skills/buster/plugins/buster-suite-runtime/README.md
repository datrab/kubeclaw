# Buster Suite Runtime Stage

This plugin runs configured Buster suites through the canonical Worker Core boundary. It converts suite outcomes into validated stage results.

The stage uses declared capabilities for artifacts, dispatch, state, and transport. Core remains the scheduler and lifecycle authority.

Run its verification with:

```bash
npm test --prefix skills/buster/plugins/buster-suite-runtime
```
