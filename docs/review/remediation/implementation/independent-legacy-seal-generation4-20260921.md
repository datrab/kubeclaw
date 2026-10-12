# Generation 4 independent artifact binding

Bounded image/launcher preparation accepted; no VM was executed by this reviewer. The reviewer authored the two added descendant cases and therefore does **not** independently accept their implementation here. Their separate nonauthor [source review](independent-legacy-seal-descendants-20260921.md) supplies that boundary. The root-authored image recipes, launcher and resulting artifacts are reviewed here independently.

The [full artifact checker](../../evidence/buster-legacy-generation4-independent-20260921/result.json) verifies all 17 manifest artifacts, full emulator runtime closure, exact guest payload/export entry sets, concrete command, actual initrd boot chain and ext4/virtio/9p modules. The three source copies match the maintained files and use independent inodes. Driver `9625b4e475639427215f844db3d677e184dea7f5e5f9fa1dac5b3d37b577bdf8` includes 29 cases under the unchanged maximum 32; helper/verifier bytes remain unchanged. Both regular disk files have the original sizes and independently observed distinct ext4 UUIDs.

Final hashes:

- Manifest: `acea3909940af8979c49145edad1b2f8596a6f1829bc853aa65b51831d8e8835`.
- Launcher: `69c57862fc39c01201a2aac2a2cc0d74dc2b32fa8a1f7f6e89bac5ba9196f81b`.
- Root disk: `c9cdfe4eed53874e27629ecef3eee06aca2be8b023c1afd33a29d814f1e0000c`.
- Second disk: `3d4e24595269cfd9224051db0ed8159698a6d966e8dba2082a994d7ab6d8ea59`.

[Preservation checks](../../evidence/buster-legacy-generation4-independent-20260921/run3-preservation.json) rehash Generation 3's disks against its terminal result and verify unchanged logs/export. New disks have independent inodes. Both recipes and the launcher differ from Generation 3 only by generation paths/names; the separately reviewed fixed 768 MiB baseline/1,792 MiB emulator address-space corridor and all other guards are unchanged.

Run 3 remains an actual memory-watchdog termination with no case outcome. Runs 1 and 2 remain failed. The coordinator must still satisfy verify-only/resource preflight and review the actual complete terminal output. No mount or privileged host action occurred during this review. The existing lack of cached debugfs/dumpe2fs remains explicit: image-content binding relies on genuine mke2fs preparation, exact input tree and full image hashes, not a fabricated on-disk/kernel proof. The LIS7 replaced-original-store comparison and whole migration authority remain open regardless of a future passing suite.
