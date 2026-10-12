import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { parseAllDocuments } from "yaml";

test("actual Helm worker bootstrap readiness preserves post-install migration startup", () => {
  const rendered = execFileSync("helm", ["template", "prism", "charts/prism", "-f", "charts/prism/ci-values.yaml"], { cwd: new URL("../../../", import.meta.url), encoding: "utf8", timeout: 30_000 });
  const documents = parseAllDocuments(rendered).map(document => document.toJSON());
  const worker = documents.find(document => document?.kind === "Deployment" && document.metadata.name.endsWith("-worker"));
  assert(worker);
  assert.equal(worker.spec.template.spec.containers[0].readinessProbe.httpGet.path, "/bootstrap");
  assert.equal(worker.spec.template.spec.containers[0].livenessProbe.httpGet.path, "/health");
  const migration = documents.find(document => document?.kind === "Job" && document.metadata.name.includes("migrat"));
  assert(migration.metadata.annotations["helm.sh/hook"].includes("post-install"));
});
