# Evolved entry and complete-profile contract (proposed C1)

Status: normative proposal; independently unreviewed, not implemented or approved. [Exact contract and source hashes](../evidence/config-acceptance/c0-completion-20261013/c1-package-draft/entry-profile-contract.json). This settles the design choice; it does not waive the remaining original cases or package review.

## One existing entry evolved, one owner author

The sole composition entry is `config/pipeline.config.json`, version **pipeline-entry.v3**. It evolves existing swarm-entry.v2, not a second parallel index. The six references are exactly `components/{owner}.config.json`. Each owner file uses the already-proposed **pipeline-component.v2** envelope `{schemaVersion, owner, profiles}` with complete `{settings}` profiles. All setting values live there, never in the composition root.

Initial `standard` profiles preserve every current owner setting. The complete current Buster runtime variant becomes `profiles.runtime` in **the same** Buster owner file; there is no second editable runtime-profile file and no merge with standard. Original eight current-author source identities remain pinned, and each original settings object has a recorded digest. Fixtures named local-A/local-B remain separately preserved test inputs, not automatically selected deployed profiles.

Root `profile`, `features`, `tuning` and empty `overrides` preserve current fixed metadata exactly. In particular retention=high is not a duration or retention author. The root gains required explicit `bindings`; `_doc` remains optional. No unknown keys/default injection/coercion is permitted.

## Explicit C1 selection

Each binding has exactly `role`, `owner`, `instanceId`, `profileId`. Role is nova/buster/prism; owner is one of the six existing component owners; profileId is an exact declared profile member. `(role,owner,instanceId)` is unique. Caller selection must match exactly one binding and the actual selected service/packaged role identity; there is no first-profile fallback. Instance names are explicit identities, not discovered defaults or authorization grants. Unused/deployed binding names may not be fabricated from a fixture name.

Every owner file and every declared profile is validated against its actual complete staged owner schema before publication, plus selected cross-owner and installed-role relations. A structurally valid profile does not install a plugin or grant execution. Plugin/adapter registration profiles are the separately scoped C2/C4 extension; C1 must not pretend arbitrary plugin registration is already supported.

## References and publication

Only the six fixed relative component references are supported. Reject missing/unknown owners or profiles, duplicate bindings, owner mismatch, wrong version, unsafe/dot/absolute/escaping/symlinked refs and competing old authors even if equal. No arbitrary include resolver is introduced. Validate the complete generation and relationships before publishing an immutable root+components directory tree.

Both real Charts and every consuming image/package receive that identical read-only tree. Preserve no-follow/regular-file/stat-drift checks and freeze; extend bundle identity to **relative path + file SHA256 + selected binding tuple/profile**. Flattening or using basename-only identities must not hide different directory or profile selections. The runtime component settings facade is generated from the selected profile, not another editable author.

C1 retains `SWARM_CONFIG` as the **mandatory explicit transport locator name**, pointing to `/etc/kubeclaw/config/pipeline.config.json`; it never overrides settings. Docker ENV, Chart mounts, native startup, image verification and fixtures must all migrate together. New starts reject the old filename and never auto-find another ENV/entry. Renaming the locator itself is unnecessary to the confirmed file-name goal and would add a second compatibility surface.

## Activation and history

C1 binds process/service startup only. It does not implement durable module/run selection or live reload; those remain C5 with their original cases. Historical v2 run recovery keeps its authentic captured reader/schema/package/config closure; it is not an old-author fallback for a new v3 start. Missing historic closure rejects explicitly. Secret revisions, installed instance/role/provider identities and live availability remain real external inputs at the affected boundaries, not invented inventory values.

## Preserve the supported profile-name domain

Profile IDs use exactly `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, the propertyNames domain in all six staged C1 owner schemas. There is no new lower-case-only restriction: existing local-A/local-B and other schema-valid names remain selectable if explicitly bound. The earlier narrower proposal is preserved as history, not the active domain.

[Selection-reference supersession](../evidence/config-acceptance/c0-completion-20261013/c1-package-draft/selection-reference-supersession.json) enumerates preserved original prospective `components/<owner>/profile` contracts and their active exact-tuple binding interpretation. Both are not simultaneous authorities. No original component body, case phase or result changes.
