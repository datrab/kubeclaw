# Independent tmpfs fixture correction review

Bounded source correction accepted at driver SHA-256 `d571b72b9f936e059782fb5cbdd5926e3077568cea2ab67c0019b254b78d8292`. This is a fixture review, not a successful kernel rerun. Run 2 remains failed at 26/27; its wrong rejection is preserved.

The tmpfs negative case must satisfy the verifier's earlier authority prerequisite before it can prove filesystem-type rejection. The production verifier opens and checks the ancestry, including the mounted root, for root ownership and absence of group/other write permissions, then requires ext4. The corrected fixture explicitly requests tmpfs mode 0755 and observes actual mounted UID, GID and mode before proceeding. It requires UID/GID zero and exact mode 0755 and emits those observations. Failure of that prerequisite aborts the case.

The expected `verified(args, tree, 'EXT4_REQUIRED')` call is unchanged, as are the terminal success marker and return. No arbitrary rejection is accepted. The [independent AST comparison](../../evidence/buster-legacy-tmpfs-independent-20260921/result.json) confirms all code outside this single tmpfs block is identical to the bound Generation 2 source; all 27 cases, capabilities, time/output limits and existing checks remain. The capability helper and actual verifier are untouched.

No additional source defect was found. This reviewer performed no mount, namespace or capability operation. Generation 3 must independently bind these exact bytes and prove the observed mounted-root authority followed by the specific ext4 rejection. Full LIS acceptance remains pending that actual execution and the complete unchanged suite.
