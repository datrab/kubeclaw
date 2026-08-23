# Container-Build Replacement Implementation Plan

Status: complete; superseded by parity and cutover

This is the implementation phase of the shared suite-migration workflow. It
builds the replacement for the old Buster `build` suite. It does not switch
gate authority and does not delete old code.

## Fixed architecture

```text
committed repository
  → explicit Dockerfile or versioned template
  → Buster container.build capability
  → rootless BuildKit
  → operator-owned local registry
  → registry manifest digest verification
  → typed immutable image output
```

The provider only builds. It does not deploy, create a namespace, open a port,
or check health. Those jobs belong to later fixtures and tests.

## Implementation steps

1. Audit D-009 through D-012 and give every old behavior, improvement, and
   defect one stable `BUILD-*` identifier.
2. Add `kubeclaw.container-build@1` with a strict configuration schema.
3. Support a repository Dockerfile and immutable `node-static@1` template.
4. Add the narrow `container.build` capability to the Buster engine.
5. Keep BuildKit and registry settings in operator configuration.
6. Require BuildKit to push. Read the pushed manifest and hash its bytes.
7. Return one typed immutable image output plus full bounded build logs.
8. Prove the provider, runtime boundary, suite composition, and contained
   Nova-to-Buster route with real processes and files. The contained BuildKit
   contract emulator is allowed because this pod has no BuildKit daemon.
9. Keep the new path non-authoritative and the old build suite authoritative.
10. Run all regressions and Terra review before the parity phase.

## Stop conditions

The phase closed after all 36 baseline items received implementation proof,
the central path is tested, documentation is complete, regressions pass, and
Terra has no accepted finding.
