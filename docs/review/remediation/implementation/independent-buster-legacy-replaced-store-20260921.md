# Independent source review: replaced historical store

The root reviewer did not author the new guest case. The complete diff against
the retained 29-case driver was read, including closure loading, forwarded child
arguments, CLI requirements and the replacement operation. Source acceptance is
bounded to preparing a subsequent guest run; LIS7 has not yet passed in a guest.

The case captures an actual verifier observation, keeps an open descriptor to
the original inode and preserves that inode outside the inspected tree. It creates
an exclusive replacement with identical bytes, seals the tree and invokes the
same real verifier again. The original descriptor, retained path, new inode and
both store digests are explicitly checked. The maintained transaction comparator
accepts the original association and must reject the replacement. This does not
invent a physical-verifier rejection and does not call host service operations.

All 29 earlier cases remain in order; the source diff introduces no changes to
their assertions, resource limits or timeouts. The four production modules are
unchanged, imported in their actual dependency order, and source-bound through
the new required manifest. The read-only guest export and its before/after
artifact binding remain necessary for the checked-files-to-import interval.

Own unprivileged checks exercised the actual loaded comparator for original,
changed inode and changed namespace-local identifiers. They additionally rejected
a preloaded producer module and a symlinked manifest; imported temporary module
names were removed afterwards. [Own results and current hashes](../../evidence/buster-legacy-replaced-store-independent-20260921/result.json).

This is not a whole maintenance transaction test, importer authorization,
writer-quiescence proof or executed kernel result. A new independent guest
artifact generation must export the four modules, bind the manifest and pass its
two new required arguments. Earlier 29/29 guest evidence does not cover this source.
