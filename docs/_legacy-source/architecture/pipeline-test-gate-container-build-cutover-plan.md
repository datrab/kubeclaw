# Container-build cutover plan

Status: source cutover complete; production acceptance pending deployment

Make `kubeclaw.container-build@1` authoritative, mark `build` migrated, remove it from the legacy protocol, registry, execution graph, and capability map, delete its deploy-coupled runner, prove absence, run the sole replacement path, then promote to `main` after a clean review.
