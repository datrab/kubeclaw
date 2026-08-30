import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../../../charts/kubeclaw/templates/buster-namespace-controller.yaml", import.meta.url), "utf8");
const prismAccounts = readFileSync(new URL("../../../charts/prism/templates/serviceaccounts.yaml", import.meta.url), "utf8");
const prismTemplates = ["workloads.yaml", "ingestion.yaml", "jobs.yaml", "postgresql.yaml"]
  .map((name) => readFileSync(new URL(`../../../charts/prism/templates/${name}`, import.meta.url), "utf8"))
  .join("\n");

assert(controller.includes('resources: ["namespaces"]'), "namespace controller must declare namespace authority");
assert(
  /resources: \["namespaces"\]\s+verbs: \["create", "get", "delete"\]/.test(controller),
  "namespace controller must retain least-privilege namespace lifecycle authority",
);
assert(
  !/resources: \["namespaces"\]\s+verbs: \[[^\]]*"(?:list|patch|update|watch)"/.test(controller),
  "namespace controller must not gain broad namespace mutation or enumeration authority",
);
assert(!prismAccounts.includes("automountServiceAccountToken: true"), "Prism ServiceAccounts must not mount Kubernetes credentials");
assert(!/resources:\s*\[?\s*["']?namespaces/.test(prismTemplates), "Prism workloads must not declare namespace RBAC");
console.log(JSON.stringify({ ok: true, contract: "agent-namespace-rbac.v1" }));
