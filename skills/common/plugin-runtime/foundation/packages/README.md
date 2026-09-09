# External package installation

`installExternalPackage` validates and copies an already local, bundled package
under operator source/digest or verified-attestation policy, then publishes it
by rename. It downloads nothing, executes no lifecycle scripts or plugin imports,
and grants no capabilities. `removeInstalledPackage` removes a direct child of
the installation root; its caller owns authorization and draining pinned runs.

Before copying and before publishing, installation validates the manifest,
registry references, digest and syntax of every bundled JavaScript/TypeScript
file. This covers stages, observers, test providers, report adapters and their
bundled import closure; even unused executable files must parse. This does not
prove module resolution, exported function shape or runtime behavior.
External capability adapters, node_modules and package scripts remain forbidden.

Registry discovery and runtime activation are separate operations. Installation
is atomically visible at rename, not a documented power-loss durability guarantee.
