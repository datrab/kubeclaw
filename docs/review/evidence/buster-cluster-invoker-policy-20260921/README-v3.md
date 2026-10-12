# Private V3 route completeness correction

V2 production and every other source/test byte remain unchanged. V1/V2 snapshots and manifests are preserved. No integration or runtime/type/lint execution.

The actual production runtime configuration module adds two independent route pairs: only `kubernetes.exposure`, and only `kubernetes.runtime-security` with all existing source prerequisites explicitly authored. Each first omits `clusterBindings`, asserts the exact `BUSTER_REMOTE_CONFIG_INVALID:clusterBindings` exception and absence of its new state root. Then the otherwise identical configuration supplies the real namespace binding and must construct, start and stop the actual production runtime successfully. No plan is submitted, child/provider is executed or cluster is queried. These positive controls establish factory/configuration usability; they are not invoker-operation or external-cluster proof. The original Kube route pair, all original assertions and deadlines remain unchanged.

Run the full `check-pipeline-remote-runtime-config.mts` module in the planned original block. README-v2 and README-v1 describe unchanged scope and pending gates. This is a private source candidate requiring independent review and coordinated actual validation.
