# Independent Kubernetes provider configuration extraction

Source-only accepted for coordinated integration and actual tests. Manifest hashes match, the live baseline matches before.js, and the complete suffix from manifestInput through execute/cleanup/testContract is byte-identical. Four helpers retain image/input, service, retention/readiness and credential validation expressions and error precedence in that order. Selected defaults, deduplication and optional-field omission remain unchanged. Cleanup disposition behavior is untouched. No policy rule is relaxed.

One representational difference is explicit: optional serviceTargetPort is inserted earlier in the intermediate returned object. The unchanged actual capabilityRequest selects properties explicitly, so its serialized field order and current consumer behavior remain unchanged; this review does not claim byte-identical JSON.stringify(testContract.configuration(...)). Inputs on the real IPC path are plain JSON rather than getter-bearing objects.

No runtime/types/lint were executed. Original provider/cleanup suites and canonical lint remain required. Existing request defaults remain separate D17 work; this extraction is not configuration migration. Exact reviewed files and checks are retained under ../../evidence/independent-kubernetes-provider-config-simplicity-20260921/.
