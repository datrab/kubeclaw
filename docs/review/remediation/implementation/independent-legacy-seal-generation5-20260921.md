# Generation 5 independent artifact binding

Bounded image/launcher preparation accepted, without VM execution. The reviewer authored the two descendant cases, whose separate [nonauthor source review](independent-legacy-seal-descendants-20260921.md) remains authoritative; this review covers the root-authored artifacts and unchanged execution machinery.

[Independent checks](../../evidence/buster-legacy-generation5-independent-20260921/result.json) verify all 17 artifact hashes/types/modes, complete tool closure, exact payload/export entry sets, source-copy identities, concrete command, copied initrd/module boot chain and distinct ext4 UUIDs. Source export is byte-identical to Generation 4, including the same 29 cases and driver `9625b4e475639427215f844db3d677e184dea7f5e5f9fa1dac5b3d37b577bdf8`. No limits or case assertions changed.

Bindings:

- Manifest `1dabc96131efca66c0768edc00e03ecaa374fb2159a81c52d82bb6ea69705d1c`.
- Launcher `7124ea82a0d1d7f4d6a650f27dd453024acaf3dc856e7e2bbf340ca32a67151e`.
- Root disk `85740da5adcd5fbc40e4acf2c4567e79e28d141efdc62953e58b4f20045ab731`.
- Second disk `f351a2048958b4bd98a656546b8e343adfdb1b25c01ee79d37796b5bbb26c6d0`.

[Preservation checks](../../evidence/buster-legacy-generation5-independent-20260921/run4-preservation.json) confirm Generation 4 disks match terminal hashes and its logs/export remain unchanged. New disks use independent inodes. Recipes and launcher differ only in generation paths/names. All fixed admission, guest and watchdog limits remain unchanged.

To avoid repopulating preserved image cache, current and previous disk verification now issues the separately reviewed DONTNEED hint only after exact hash/size/UID/mode/nlink/type checks on the same read-only NOFOLLOW descriptor, with unchanged stamps before/after. Only the four explicit images read by this review receive that hint. This changes no file contents, budget or global cache control and claims no guaranteed reclamation or causal explanation for earlier memory stops.

The earlier on-disk inspection limitation remains: cached debugfs/dumpe2fs are absent, so complete payload assurance uses genuine mke2fs preparation, independently checked input trees and full image hashes. Run 4 remains a memory-watchdog interruption with no case result; earlier failed runs remain preserved. Verify-only/resource preflight and actual terminal execution are still required. Passing this artifact review does not close LIS7 or migration authority.
