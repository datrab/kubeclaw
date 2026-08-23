import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const manifest=JSON.parse(readFileSync(new URL("../../../skills/nova/plugins/prism-design/plugin.json",import.meta.url),"utf8"));
assert.equal(manifest.id,"kubeclaw.prism-design");
assert.deepEqual(manifest.stages[0].requiredCapabilities,["runtime.dispatch","artifacts.read","artifacts.write","operator.request","signal.wait"]);
const role=JSON.parse(readFileSync(new URL("../../../packaging/runtime/roles/nova.json",import.meta.url),"utf8"));
assert(role.plugins.includes("kubeclaw.prism-design"));
console.log(JSON.stringify({ok:true,contract:"nova-prism-stage.v1"}));
