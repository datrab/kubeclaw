import assert from "node:assert/strict";
import test from "node:test";
import register from "./index.mjs";

test("Prism OpenClaw plugin enforces one exact three-design commit tool", () => {
  const tools = [];
  register({ registerTool(tool) { tools.push(tool); } });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "prism_create_design_set",
    "prism_apply_revision",
  ]);
  const designs = tools[0].parameters.properties.designs;
  assert.equal(designs.minItems, 3);
  assert.equal(designs.maxItems, 3);
  assert.deepEqual(designs.items.required, ["key", "title", "summary", "document"]);
});
