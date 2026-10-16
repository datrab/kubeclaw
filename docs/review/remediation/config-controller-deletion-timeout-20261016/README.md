# Captured namespace deletion timeout

Captured selected namespace deletion timeout feeds actual API polling; original120 seconds preserved; local two-minute default removed. Real A1 timeout/B2 deletion success with same1300ms deletion visibility, owner removed after capture; missing/invalid/overflow selection rejected. Real Helm A120/B240 values reach actual Go receiver.

Sole author: charts/kubeclaw/values.yaml#/busterNamespaceBroker/controller/policy/namespaceDeletionTimeoutSeconds. No hot reload or additional ENV author. Existing cleanup callers and polling semantics unchanged. Strict startup capture and original fixture retain120 seconds. Independent controller and full C0–C6/native acceptance OPEN.
