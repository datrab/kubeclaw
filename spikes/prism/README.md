# Prism Foundation Spikes

These packages are isolated proofs. Production packages must not import them.

Use a writable temporary npm cache:

```bash
PRISM_NPM_CACHE=$(mktemp -d)
npm --cache "$PRISM_NPM_CACHE" install --prefix spikes/prism/puck-adapter
```

Each package has its own lockfile and pinned dependencies.
