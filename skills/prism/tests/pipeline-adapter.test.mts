import test from "node:test";
import assert from "node:assert/strict";
import { toBusterPlan, toForgeAssignments } from "../pipeline-adapter/index.ts";
test("approved Prism targets map to the existing Buster suites", () => {
  const plan = toBusterPlan({
    baselineDigest: `sha256:${"a".repeat(64)}`,
    projectId: "demo",
    targets: [
      {
        id: "home-wide",
        view: "home",
        state: "default",
        viewport: "wide",
        fidelity: "exact",
        path: "/home",
      },
    ],
  });
  assert.deepEqual(plan.suites, ["visual-reg", "a11y", "e2e"]);
  assert.equal(plan.paths[0]?.viewport.width, 1440);
  assert.equal(plan.baselineDigest.length, 71);
});
test("invalid baseline digests fail closed", () => {
  assert.throws(
    () =>
      toBusterPlan({
        baselineDigest: "sha256:not-a-digest",
        projectId: "demo",
        targets: [
          {
            id: "home",
            view: "home",
            state: "default",
            viewport: "wide",
            fidelity: "exact",
            path: "/",
          },
        ],
      }),
    /digest/,
  );
});
test("Forge receives read-only module-scoped targets",()=>{
  const baseline={baselineDigest:`sha256:${"a".repeat(64)}`,projectId:"p",targets:[{id:"auth",view:"sign-in",state:"default",viewport:"wide" as const,fidelity:"exact" as const,path:"/sign-in"},{id:"dash",view:"dashboard",state:"default",viewport:"wide" as const,fidelity:"intent" as const,path:"/"}]};
  const [assignment]=toForgeAssignments(baseline,[{moduleId:"auth-module",targetIds:["auth"]}]);
  assert.equal(assignment?.access,"read-only");assert.deepEqual(assignment?.targets.map(({id})=>id),["auth"]);
});
