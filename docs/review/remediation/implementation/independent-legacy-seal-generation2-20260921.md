# Independent legacy seal Generation 2 artifact review

Status: bounded preparation accepted for the coordinator's unchanged verify-only and launch gates. No VM was executed by this reviewer. Run 1 remains failed: all 27 cases stopped in setup. This acceptance does not establish any LIS kernel criterion or production stop authority.

The [independent checker result](../../evidence/buster-legacy-generation2-independent-20260921/result.json) binds all 17 manifest artifacts, their exact bytes/modes/regular-file types, the complete emulator tool closure, the complete guest payload and source-export entry sets, and the concrete printed launch command. The actual copied initrd boot script and required ext4/virtio/9p modules were inspected again. Ext4 superblock reads confirm two distinct UUIDs and unchanged 256 MiB/16 MiB logical disk sizes. No host mount, namespace or capability operation was performed.

The source export contains the exact corrected driver `db816f090613843fcc43b024f606d9441b06cd2006a4779ca7a1f365db0ba9ef`, with unchanged helper `3423e4dc08f62d4e9c4ff65fb43bf676e6b79bab44aedca30da0012ade52aed8` and verifier `526590e00e663594e399028b17708fd4afecf595a4f776e6f5c00906a316962e`. All are independent file copies. The [source correction review](independent-legacy-seal-mount-correction-20260921.md) proves all 27 cases and limits remain intact.

Final bindings:

- Artifact manifest: `cb498bf7c22692b1cff19d42dd37aed622e1138c876652efb0c8640e184a26cf`.
- Launcher: `0f99289581fe576b1c41566adac4a6e19752e5a35216c07e9a24544ef02dd183`.
- Root disk: `761590aa660e1bd793e8a80fd07ab602c6a70ff79319e2abfb1ead8cc7626e79`.
- Second disk: `7e771f1e68fcdca161a993a26612288036e4eba0f731f279d7d387bb41f96cf2`.

An independent normalized comparison proves the launcher differs from the separately reviewed smaller-address-space version only in the generation name and isolated cache/evidence paths. Its fixed 768 MiB charged-baseline admission limit and 1,792 MiB emulator address-space limit remain unchanged, as do guest memory, CPUs, wall/boot/CPU/output limits, source checks and post-run verification. This fixed split is not a no-OOM guarantee and does not authorize automatic retries or increasing limits after refusal.

[Run 1 preservation evidence](../../evidence/buster-legacy-generation2-independent-20260921/run1-preservation.json) confirms both original disk hashes still equal their recorded terminal hashes, both old logs are byte-identical to the retained copies, and the old source export is unchanged. Generation 2 disks have different inodes. Runtime/image recipes differ only in the new isolated destination paths; kernel and initrd retain their previously bound hashes.

The prior image-inspection limitation remains explicit: no cached debugfs/dumpe2fs exists, so complete on-disk directory inspection relies on real successful `mke2fs -d`, the exact checked input tree and full disk hashes. No substitute parser or simulated kernel success is claimed. Actual boot, all 27 case outcomes and terminal post-hashes still require review after execution.
