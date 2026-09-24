# Visual Regression Security Model

## Trust boundaries

Nova owns plan resolution, source signing, grants, and gate decisions. Buster owns source verification, job recovery, isolation, browser launch, network authority, evidence storage, and cleanup. The project supplies declarative files and cannot start a browser or choose an evidence path.

## Filesystem controls

All manifest, profile, and PNG paths must be relative regular files inside the real repository root. Symlink escape, absolute paths, parent traversal, missing files, oversized documents, and digest mismatch fail closed. The provider checks the PNG header and bounds both compressed bytes and decoded pixel memory before PNGJS allocation. The provider writes only runner-owned evidence files.

## Network controls

The capability accepts one authorized HTTP(S) origin from operator policy or a typed fixture. It denies credentials in URLs, cross-origin redirects and subresources, service workers, WebSockets, and WebRTC. Pages cannot expand this authority.

## Integrity controls

The manifest binds route and rendering identity. Each PNG has SHA-256 identity. The bundle digest binds the complete baseline set. Capability output repeats route, profile, browser, viewport, conditions, masks, and screenshot digest; the provider checks them before comparison.

## Residual risk

Fonts, GPU behavior, and browser upgrades can change pixels. Pinned worker images and explicit browser versions reduce this risk. Production acceptance must use the same deployed worker class as normal execution.
