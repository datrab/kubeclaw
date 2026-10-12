# Legacy seal descendant authority cases

Pre-edit acceptance:

1. Add two maintained cases: a foreign-owned regular descendant and a group-writable descendant directory beneath otherwise trusted, fully immutable ancestry.
2. Observe the actual offending UID/mode and immutable flag after preparation, then require the unchanged verifier's exact AUTHORITY_INVALID rejection without a published observation.
3. Preserve all original 27 cases, their assertions and deadlines; retain MAX_CASES 32 and every byte/output/time bound. No verifier change or privileged host execution.
4. Preserve the before source and demonstrate all other AST statements unchanged. Exercise fixture branch/oracle plumbing with explicitly modeled unprivileged probes; genuine ext4 execution remains pending.
5. DOC: record Run 3's host-memory watchdog termination separately, keep replaced-original-store LIS7 open, and require fresh nonauthor review before guest preparation.

Implementation complete; fresh nonauthor review and actual guest execution pending.

The driver adds `foreign-descendant` (UID 1000 regular `records/store.json`) and `writable-descendant` (root-owned `records` directory, mode 0775). Preparation changes these entries before the original recursive immutable seal. Each new case then observes the offending identity/mode, verifies every tree entry is immutable, emits the actual authority observation, and invokes the original verifier with the specific `AUTHORITY_INVALID` oracle. Original successful `complete` coverage remains the valid-authority control.

The [maintained comparison and modeled branch evidence](../../evidence/buster-legacy-descendant-cases-20260921/checks.json) confirms all original 27 cases and all other AST statements remain identical after removing only the two added cases/branches. There are now 29 cases, below the unchanged maximum of 32. Five unprivileged modeled checks cover both oracle calls plus wrong UID, wrong mode and incomplete seal; these establish fixture control flow only. Actual immutable/ext4 rejection remains a future guest requirement. Isolated Python help exits zero.

The frozen driver hash is `9625b4e475639427215f844db3d677e184dea7f5e5f9fa1dac5b3d37b577bdf8`; helper and verifier bytes are unchanged. The previous driver and identity manifest are retained in the evidence directory. Source identities were updated only after the freeze announcement. No prior guest generation was modified.

Run 3 independently read raw terminal evidence: the wrapper stopped QEMU after 26.805 seconds at its unchanged 2.75 GiB shared-memory threshold. There are no case results, so it supplies no new LIS acceptance. Earlier failures remain preserved. The replaced-original-store association under LIS7 remains a separate open integration requirement; these cases do not close it.
