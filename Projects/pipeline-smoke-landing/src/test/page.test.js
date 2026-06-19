const assert = require("node:assert/strict");
const test = require("node:test");
const { renderPage } = require("../src/page");

test("renderPage includes required landing page foundation markup", () => {
  const html = renderPage();

  assert.match(html, /<title>Pipeline Smoke Landing<\/title>/);
  assert.match(html, /<main>/);
  assert.match(html, /id="foundation"/);
  assert.match(html, /data-module="01-foundation"/);
});
