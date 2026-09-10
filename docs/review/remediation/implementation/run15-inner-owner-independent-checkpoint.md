# Independent inner-owner checkpoint — rejected incomplete slice

Exact source: remote 8ae8a0859e6111683fb87e810039488f3f9b0d52, author
d8f77ff08e351cdada12835015a593db6d25e59b, tree cfb9121afab4c62007e37d3b8fc5bb1d09d3cbf3.
New isolated reviewer checkout run15-semantic-inner-review was reconstructed as
a standalone snapshot and its complete tree matches all 4,107 remote entries.
No old local Git history is needed. Current remote mandatory resume documents,
register and original PCR-SDK-001 requirements were read; original c387 register
again yields exactly 47 IDs matching the frozen current scope. Approved designs
bbb072 and independent8ee1 were read in full before review.

Dependencies use the existing immutable third-party cache, with all62 current
workspace symlinks relative inside this checkout. Initial link audit identified
one additional dangling historical plugin-test-agent alias; only that own copied
symlink was removed. No linked third-party file, source or other checkout changed.

## Direct independent result: two pass, nine fail

Command: LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node --test
tests/verification/reliability/review-inner-owner-independent.test.mjs

Complete raw: docs/review/evidence/run15-inner-owner-independent-before.txt.
Exit one; 11 cases, two pass, nine fail, zero skips. Original policy values for
gate/lean/audit, actual resolver precedence/authorized override, all provenance
digests, authentic private mode and clone rejection pass. Original generated
forwarding-source facts and original miner/certificate positive pass; old/new
logical facts and candidate IDs are equal and new source.digest references the
actual generated content. These are DIRECT OWNER checks, not a registered Core
lifecycle, real stored ArtifactStore reader, model or full native producer proof.

Eight direct no-trap negatives fail on the new owner boundaries:

- Fact context Proxy executes8 traps; content getter executes1.
- Fact revision Proxy executes10 traps; head getter executes1.
- Manifest input Proxy executes12 traps; policy getter executes7.
- Miner input Proxy executes7 traps; policy getter executes4.

The approved no-trap JSON admission must precede any such reflection on owning
plain JSON inputs. Do not blanket serialize method-bearing PluginContext values.
The ninth failure substitutes only the digest of genuinely generated valid facts:
the miner still emits a candidate referring to that incorrect source digest.
Its new parseSource verifies codec bytes but does not verify the content hash.
This is a direct miner authority failure, not a proven native stage bypass;
the full bundle reader has separate evidence validation. The approved design
requires wrong digest/content rejection at the actual owner boundary.

Root and author received the exact failures before any production correction.
The reviewer has made no production edits.

## Independently reproduced original legacy regression

Command: node skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs

The unchanged original fixture passes its original parsed Echo input and genuine
legacy resolved policy with a legal opaque placeholder bundle.policyDigest. The
new assertReviewPolicyBundle rejects at the original line38 call with
REVIEW_BUNDLE_POLICY_DIGEST_MISMATCH; exit one preserved in
docs/review/evidence/run15-inner-original-preflight-before.txt.

Restore this original exported legacy helper admission without weakening any
existing native validation. Explicit new bundle.v2 must still bind exact policy
digest and authentic resolver mode, and forged/cross-mode certificates reject.
Root conditionally authorized that narrowly bounded correction; no original
fixture/assertion is changed by this reviewer.

## Next action / acceptance limits

Await exact frozen author correction; independently rerun the unchanged permanent
oracle and unchanged preflight test, then check v2 policy mismatch, selected mode,
private reduction certificates and actual stored candidate-reader admission with
bounded direct checks. Preserve current remote metadata on every backup. No MAIN
write or finding closure. No heavy native matrix and no safety-flagged helper
operation retry, rephrasing or reroute. The native original producer proof remains
red only; required initial/slice/expanded/history/crash/storage acceptance and the
separate delivery-manifest owner are still incomplete.
