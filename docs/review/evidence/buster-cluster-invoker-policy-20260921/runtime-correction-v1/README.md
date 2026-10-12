# Private correction to Runtime1 test defects

No live edits or runtime checks. Runtime1 failures are retained; this draft does not reclassify them as passes.

The inactive-profile test previously called writeTestBundle, reserializing all other active component documents and therefore legitimately changing the checksum. It now guards and writes only the inactive canonical Buster file, compares every active input Buffer and the complete delivered ConfigMap data to baseline, retains the original checksum equality assertion, then restores the exact inactive Buffer in finally. The selected-profile positive checksum-change control is unchanged. All private inode/realpath guards remain before writable opens.

The original Kubernetes source oracle now checks the actual readiness module's authored shortCommandTimeoutMs within both Math.min(deadline remainder) and Math.max(1) clamps. The earlier source literal 15000 is intentionally no longer an author. No assertion is removed, nor any original deadline or runtime case changed. Existing real constructor/command/poll and original readiness runtime tests remain required. This static oracle alone is not a behavioral timing proof.
