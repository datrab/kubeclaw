import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the real Prism E2E`);
  return value;
};
const endpoint = required("PRISM_CONTROL_URL").replace(/\/$/, "");
const agentEndpoint = required("PRISM_AGENT_URL").replace(/\/$/, "");
const ingress = required("PRISM_E2E_INGRESS_SECRET");
const user = required("PRISM_E2E_USER");
const startedAt = new Date().toISOString();
const call = async (path, init = {}) => fetch(`${endpoint}${path}`, init);
const agentCall = async (path, init = {}) => fetch(`${agentEndpoint}${path}`, init);
for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    const response = await call("/health");
    if (response.ok) break;
  } catch {
    // The native sidecar can still be obtaining its first SVID from SPIRE.
  }
  if (attempt === 60) throw new Error("Worker Trust proxy did not become ready");
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const session = await call("/v1/session", {
  method: "POST",
  headers: { "tailscale-user-login": user, "x-prism-ingress-secret": ingress },
});
assert.equal(session.status, 201);
const cookies = session.headers.getSetCookie();
const csrf = (await session.json()).csrf;
const cookie = cookies.map((value) => value.split(";", 1)[0]).join("; ");
const headers = {
  cookie,
  "x-prism-csrf": csrf,
  "content-type": "application/json",
};
const externalId = `prism-e2e-${Date.now()}`;
const architectureContent = {
  schema: "kubeclaw.architecture.v1",
  title: "Prism production acceptance",
  audience: ["operator"],
  surfaces: ["web"],
  journeys: ["review deployments"],
  states: ["default", "empty", "error"],
  constraints: ["keyboard accessible"],
};
const architectureBytes = JSON.stringify(architectureContent);
const architectureDigest = `sha256:${createHash("sha256").update(architectureBytes).digest("hex")}`;
const initialDispatchBody = JSON.stringify({
  request: {
    schema: "prism.design-request.v1",
    projectId: externalId,
    architecture: {
      artifactId: `artifact:${architectureDigest}`,
      contentDigest: architectureDigest,
      revision: 1,
    },
    architectureContent,
  },
  idempotencyKey: `${externalId}-request`,
});
const initialDispatchKey = `${externalId}-request`;
const initialDispatch = await agentCall("/v1/dispatch", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": initialDispatchKey,
  },
  body: initialDispatchBody,
});
assert.equal(initialDispatch.status, 202, await initialDispatch.clone().text());
let projectId="";let documentId="";
for(let attempt=0;attempt<180;attempt++){
  const projectsResponse=await call("/v1/projects",{headers:{cookie}});
  if(projectsResponse.ok){const project=(await projectsResponse.json()).items.find((item)=>item.external_id===externalId&&item.direction_count===3);if(project){projectId=project.id;documentId=project.document_id;break;}}
  await new Promise((resolve)=>setTimeout(resolve,2000));
}
assert.ok(projectId&&documentId,"OpenClaw Prism agent did not commit exactly three designs");
const directionsResponse=await call(`/v1/projects/${projectId}/directions`,{headers:{cookie}});
assert.equal(directionsResponse.status,200,await directionsResponse.clone().text());
const directions = (await directionsResponse.json()).items;
assert.equal(directions.length,3);
const chosen = await call(`/v1/directions/${directions[0].id}/select`, {
  method: "POST",
  headers,
  body: JSON.stringify({ documentId: directions[0].source_document_id }),
});
assert.equal(chosen.status, 200, await chosen.clone().text());
const chosenResult=await chosen.clone().json();
const selectedDocument = chosenResult.document;
documentId=chosenResult.documentId;
const engine = await call(`/v1/documents/${documentId}/engine`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    operation: "generate",
    baseRevision: selectedDocument.meta.revision,
    idempotencyKey: `${externalId}-generate`,
    input: {
      instruction:
        "Keep the layout and make the heading identify this live acceptance run.",
    },
  }),
});
assert.equal(engine.status, 202, await engine.clone().text());
let current;
for(let attempt=0;attempt<180;attempt++){
  const currentResponse=await call(`/v1/documents/${documentId}`,{headers:{cookie}});
  assert.equal(currentResponse.status,200);
  current=(await currentResponse.json()).document;
  if(current.meta.revision>selectedDocument.meta.revision)break;
  await new Promise((resolve)=>setTimeout(resolve,2000));
}
assert.ok(current.meta.revision>selectedDocument.meta.revision);
const revisions = await call(`/v1/documents/${documentId}/revisions`, {
  headers: { cookie },
});
assert.equal(revisions.status, 200);
assert.ok((await revisions.json()).items.length >= 3);
const designDigest = `sha256:${createHash("sha256").update(JSON.stringify(current)).digest("hex")}`;
const evaluation = await call(`/v1/documents/${documentId}/engine`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    operation: "evaluate",
    baseRevision: current.meta.revision,
    idempotencyKey: `${externalId}-evaluate`,
    input: {},
  }),
});
assert.equal(evaluation.status, 200, await evaluation.clone().text());
const findings =
  (await evaluation.json()).specialistResult.values.findings ?? [];
const acceptedWarningIds = findings
  .filter((finding) => finding.level === "review")
  .map((finding) => finding.id);
const approvalResponse = await call("/v1/approvals", {
  method: "POST",
  headers,
  body: JSON.stringify({
    projectId,
    documentId,
    designDigest,
    acceptedWarningIds,
  }),
});
assert.equal(
  approvalResponse.status,
  201,
  await approvalResponse.clone().text(),
);
const approvalId = (await approvalResponse.json()).id;
const baselineResponse = await call("/v1/baselines", {
  method: "POST",
  headers,
  body: JSON.stringify({ projectId, documentId, approvalId }),
});
assert.equal(
  baselineResponse.status,
  201,
  await baselineResponse.clone().text(),
);
const baseline = await baselineResponse.json();
assert.match(baseline.bundleDigest, /^sha256:[a-f0-9]{64}$/);
const dispatchBody = JSON.stringify({
  request: {
    schema: "prism.design-request.v1",
    projectId: externalId,
    architecture: {
      artifactId: `artifact:${architectureDigest}`,
      contentDigest: architectureDigest,
      revision: 1,
    },
    architectureContent,
    approvalId,
  },
  idempotencyKey: `${externalId}-dispatch`,
});
const dispatchKey = `${externalId}-dispatch`;
const dispatch = await call("/v1/dispatch", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": dispatchKey,
  },
  body: dispatchBody,
});
assert.equal(dispatch.status, 200, await dispatch.clone().text());
const handoff = (await dispatch.json()).result;
assert.equal(handoff.bundleDigest, baseline.bundleDigest);
const evidence = [baseline.bundleDigest, designDigest];
console.log(
  JSON.stringify({
    status: "passed",
    testVersion: "prism-live-service-e2e.v3",
    scope: "prism-service-only",
    novaStage: false,
    projectId,
    documentId,
    approvalId,
    directionCount: directions.length,
    repositoryCommit: process.env.GITHUB_SHA ?? "local",
    imageReferences: required("PRISM_E2E_IMAGE_REFERENCES").split(",").filter(Boolean),
    clusterIdentity: required("CLUSTER_ID"),
    namespace: process.env.PRISM_NAMESPACE ?? "kubeclaw",
    startedAt,
    finishedAt: new Date().toISOString(),
    evidenceArtifactDigests: evidence,
    skippedChecks: ["nova-stage", "forge-implementation", "buster-fidelity"],
  }),
);
