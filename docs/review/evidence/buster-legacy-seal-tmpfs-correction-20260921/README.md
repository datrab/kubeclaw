# Root-protected tmpfs fixture correction

Generation 2 completed 26 of 27 cases. Its tmpfs-root case observed AUTHORITY_INVALID before the unchanged expected EXT4_REQUIRED rejection: the fixture mounted tmpfs without a mode and therefore did not establish the criterion's root-protected ancestry. Run 2 remains a failed gate; its frozen driver and images are untouched.

The maintained fixture now requests size=64k,mode=0755 and checks the actual root UID, root GID and mode before invoking the unchanged verifier assertion. It emits those observed prerequisites. No verifier logic, expected result, case list, resource bound or deadline changed. The different-device case is unchanged because its intentionally foreign child is rejected by the original mount/device boundary.

Nonprivileged validation parsed both sources, replaced only the tmpfs-root AST block with its previous version, and established exact remaining AST equality. The expected verified(args, tree, 'EXT4_REQUIRED') call is identical. Driver --help exits 0. These are source checks, not guest or kernel proof. All 27 cases require a fresh guest execution and independent review.
