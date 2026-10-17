# Captured runtime-security refresh interval

Sole author: charts/kubeclaw/values.yaml#/busterNamespaceBroker/controller/policy/runtimeSecurityRefreshSeconds. Original 5 seconds preserved. The existing policy ConfigMap/read-only mount and rollout checksum deliver the complete required policy; strict startup capture feeds the actual reconcile caller. No independent ENV/default or hot reload. Future-clock tolerance is separate unchanged behavior.

Original patch-loop cases retained. Actual Helm A5/B10 delivery executes the Go receiver at exact boundaries; existing process capture remains usable after owner change/deletion, while new missing selection fails. Strict malformed/missing/duration-overflow validation includes the new required field. 120 Go test/subtest pass events (nested, not acceptance obligations), 5 delivery tests passed. Independent controller and full native/C0–C6 acceptance OPEN; reviewer EROFS unchanged. No deployment/main merge.
