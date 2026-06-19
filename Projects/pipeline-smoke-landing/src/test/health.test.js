const assert = require("node:assert/strict");
const test = require("node:test");
const { buildHealthPayload } = require("../src/health");

test("buildHealthPayload returns the module health contract", () => {
  assert.deepEqual(buildHealthPayload(), {
    status: "ok",
    service: "pipeline-smoke-landing",
    module: "01-foundation"
  });
});
