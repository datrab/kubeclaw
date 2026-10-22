# Source-discovery self-test: namespace fixture correction

**Bounded Source/code PASS.** No remaining material finding or unread assigned changed scope.

The sole change adds --namespace kubeclaw to the local Helm helper inside selfTest. Reversing that line restores the complete discovery file's baseline bytes. No discovery algorithm or exported production behavior changes. The helper and all three local callers were read completely: Buster and Prism-agent KubeClaw fixtures and the Prism fixture now share the namespace already selected by the owning inventory renderer.

Prism's actual workload guard requires worker.native.namespace equal Release.Namespace, in addition to one worker, selected node and64hex digest. The fixture already selected native.namespace=kubeclaw, a source-discovery node and synthetic digest but omitted the Helm release namespace. The patch aligns the fixture's release/worker namespace instead of loosening the product guard. The main inventory render helper and corresponding three calls already use explicit kubeclaw namespace. Chart/default/selected-value and main-inventory whole files remain exactly HEAD.

This is a self-test fixture correction, not a runtime product or deployment change. The synthetic native node/digest remain render inputs, not accepted host bindings. No test/render/Helm/build or live endpoint was executed by this reviewer, and no cluster admission, deployment or runtime success is inferred. Supplied raw output was read only as external observation. Exact hashes, selected reads, callers and one-line reversal proof are in the JSON. No unrelated source/working-tree responsibility is approved.
