# Independent review of legacy-image cache hints

The proposed bounded cleanup of cached pages is acceptable in scope. This is a review of the proposed helper, not evidence that it has executed, reduced memory or resolved the guest failure. No privileged operation or cache hint was performed by this reviewer.

Run 4 actually stopped after 34.902 seconds at the unchanged 2.75 GiB shared-memory watchdog. Its console reaches `VM_BOOTED=1` but contains no case results or successful guest terminal marker. No foreign workload was identified in the supplied post-run process observation; this review does not blame unrelated work.

The reviewer’s own artifact and preservation checks use `hashlib.file_digest` without `posix_fadvise`. They read full old guest images as well as the current image. The launcher only hints away files beneath its current generation cache. Thus previous-generation hashing is a concrete plausible contributor to retained file cache. The supplied post-run `file` value of 1,779,302,400 bytes is not per-file attribution, and cannot prove that those images caused the watchdog stop. Kernel/slab charges and other contributors must not be subtracted to manufacture compliance.

The proposed implementation must remain narrow:

- Use an explicit finite list of this task's preserved/current legacy guest disk files, bound to their appropriate original or terminal manifests. A mutated completed disk must match its terminal hash, not its preboot hash.
- Require no VM uses the images. Open read-only without following a final symlink, check actual regular-file identity and exact size/hash on the held descriptor, and retain before/after identity checks. Reject unexpected paths, symlink substitution or changed contents.
- Call `os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)` only on those verified descriptors. No writable open, truncation, global drop-caches operation, unrelated cache walk, slab adjustment or artificial pressure.
- Record the exact selected identities, hint results and actual memory.current/memory.stat before and after. A successful hint is not a guaranteed byte reduction. Do not immediately reread full images merely to verify unchanged content and thereby repopulate their cache; any necessary subsequent full verifier should hint its own verified reads as well.
- Keep all existing memory, address-space, CPU, output and watchdog limits unchanged. This helper does not authorize automatic VM retries. Refusal and prior failures remain preserved.

Linux documents DONTNEED as advisory reclamation of the specified file region; it does not guarantee freeing pages, and dirty pages may remain. It is not a filesystem-content mutation. [Linux man-pages, posix_fadvise](https://man7.org/linux/man-pages/man2/posix_fadvise.2.html)

Under these constraints, extending the existing current-image hint to the exact preserved task-owned images is a proportionate correction to reviewer/preparation I/O hygiene. Actual measurements can show what changed after the hint, but only a separately reviewed and completed guest run can establish test outcomes. A failed or ineffective hint must not trigger stronger cache controls or budget increases.

## Concrete helper source review

The root-authored `run4/own-image-cache-hints.py` is accepted at SHA-256 `73b598c82d85edfe24a93670871d9733fdde4a24e6cfec82c1d3fdd92c83d7a9` for this bounded action. Initial inspection found the advertised mode check missing; the author added exact mode 0644 before final binding. The helper uses an explicit four-generation/two-disk list, validates each against its retained terminal digest, requires UID 1000, regular type, one link, fixed size, canonical path and mode, opens O_RDONLY/O_NOFOLLOW, checks held-descriptor/path stamps, and sends the hint on that same descriptor after hashing. It does not reread after the hint. It records per-image success/memory observations and final failure status to an exclusive new evidence file. It invokes no VM, global cache control or budget mutation.

The coordinator reports all relevant QEMU/wrapper processes terminal and no active VM before this action. The helper itself does not prove process absence; that remains the coordinated execution prerequisite. This source review did not execute the helper and therefore makes no cache-reduction claim.
