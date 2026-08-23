import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const role=JSON.parse(readFileSync(new URL("../../../packaging/runtime/roles/prism.json",import.meta.url),"utf8"));
assert.equal(role.role,"prism"); assert(role.packages.includes("worker-core")); assert(role.packages.includes("prism-engine"));
assert(!role.packages.some((value:string)=>value.startsWith("nova-")||value.startsWith("buster-")));
console.log(JSON.stringify({ok:true,contract:"prism-runtime-role.v1"}));
