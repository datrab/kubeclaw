import assert from "node:assert/strict";
import test from "node:test";
import register from "./index.mjs";

test("Prism OpenClaw plugin enforces one exact three-design commit tool", () => {
  const tools = [];
  register({ pluginConfig: {controlUrl: "http://127.0.0.1:28080"}, registerTool(tool) { tools.push(tool); } });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "prism_create_design_set",
    "prism_apply_revision",
  ]);
  const designs = tools[0].parameters.properties.designs;
  assert.equal(designs.minItems, 3);
  assert.equal(designs.maxItems, 3);
  assert.deepEqual(designs.items.required, ["key", "title", "summary", "document"]);
});


test("tool startup requires explicit plugin policy and rejects legacy ENV even when equal", () => {
  const registerTool = () => {};
  for (const pluginConfig of [undefined, {}, {controlUrl: ''}, {controlUrl: 'file:///tmp'}, {controlUrl: 'http://user:pass@localhost'}, {controlUrl: 'http://localhost/path'}, {controlUrl: 'http://localhost', other: true}]) {
    assert.throws(() => register({registerTool, pluginConfig}), /PRISM_TOOL_CONTROL_URL/);
  }
  const before = process.env.PRISM_CONTROL_URL;
  try {
    for (const value of ['', 'http://127.0.0.1:28080']) {
      process.env.PRISM_CONTROL_URL = value;
      assert.throws(() => register({registerTool, pluginConfig: {controlUrl: 'http://127.0.0.1:28080'}}), /PRISM_TOOL_LEGACY_OVERRIDE/);
    }
  } finally {
    if (before === undefined) delete process.env.PRISM_CONTROL_URL; else process.env.PRISM_CONTROL_URL = before;
  }
});

test("startup A/B policies reach actual HTTP consumers; retained A and per-call override remain isolated", async t => {
  const {createServer} = await import('node:http');
  const calls = [];
  const tools = [];
  for (const name of ['A', 'B']) {
    const server = createServer((request,response) => {
      calls.push([name,request.url]);
      response.setHeader('content-type','application/json');
      response.end(JSON.stringify({selected: name}));
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const pluginConfig = {controlUrl: `http://127.0.0.1:${server.address().port}`};
    const current = [];
    register({pluginConfig,registerTool(tool){current.push(tool);}});
    pluginConfig.controlUrl = 'http://127.0.0.1:1';
    tools.push(current);
  }
  assert.equal((await tools[0][0].execute('a',{}, {config:{controlUrl:'http://127.0.0.1:1'}})).details.selected,'A');
  assert.equal((await tools[1][1].execute('b',{})).details.selected,'B');
  assert.equal((await tools[0][1].execute('a2',{})).details.selected,'A');
  assert.deepEqual(calls,[['A','/v1/agent/design-sets'],['B','/v1/agent/revisions'],['A','/v1/agent/revisions']]);
});
