# Independent legacy seal Generation 3 artifact review

Bounded artifact preparation accepted. No VM was booted by this reviewer. The coordinator's first verify-only attempt was refused by the unchanged memory guard before artifact verification; that refusal is neither a kernel-test result nor permission to increase limits. Execution remains subject to the reviewed resource gate and serialized window.

The [independent full checker](../../evidence/buster-legacy-generation3-independent-20260921/result.json) verifies all 17 artifact hashes, sizes and modes, the full emulator closure, exact guest payload/export entry sets, independent copies of all three sources, the concrete launch command and the actual initrd boot/module chain. Read-only ext4 superblock observations confirm two distinct UUIDs and unchanged 256 MiB/16 MiB logical sizes. No mount or privileged host operation occurred.

The export binds corrected driver `d571b72b9f936e059782fb5cbdd5926e3077568cea2ab67c0019b254b78d8292`; capability helper and verifier retain their previously reviewed hashes. The [tmpfs source review](independent-legacy-seal-tmpfs-correction-20260921.md) establishes the unchanged specific `EXT4_REQUIRED` expectation and all 27 cases/limits.

Exact final bindings:

- Manifest: `bf6021e0bf017f2936be1384d6f1a6851f2c8ea0f39d9e4133cf2b860d5915cf`.
- Launcher: `f38efea66663007bb69a0145b1bdab4570fbd27776aca98a9bab51d7b1f3f35e`.
- Root disk: `18df3738bba4d4ca9916fb62f23ef918c572a0d7a96ca90257dff5c727dfa855`.
- Second disk: `876b590487473b3cf82cd38196cb70f8d816b8897260bc2a94cac0fde4a0793a`.

[Independent preservation checks](../../evidence/buster-legacy-generation3-independent-20260921/run2-preservation.json) rehash both Generation 2 disks against their terminal result, compare retained logs byte-for-byte, and verify its old export. All remain unchanged. New disks have independent inodes. Normalized comparison proves both preparation recipes and the launcher differ from Generation 2 only in generation-specific paths/names; the fixed smaller-address-space corridor and every runtime guard remain unchanged.

The earlier image-inspection limitation remains: cached debugfs/dumpe2fs are unavailable; complete image-content assurance uses real successful mke2fs preparation, the exact independently checked input tree and full image hashes. The superblock inspection is not a substitute kernel proof. Run 1 and Run 2 remain failed historical runs. Actual Generation 3 boot, mounted tmpfs authority, specific filesystem rejection and complete terminal outcomes remain pending.
