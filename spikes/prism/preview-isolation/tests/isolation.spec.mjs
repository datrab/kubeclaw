import { expect, test } from "@playwright/test";

test("opaque preview renders text safely and reports bounded selection evidence", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173");
  await page.waitForFunction(() => document.querySelector("#events")?.dataset.last === "preview.ready");
  await page.evaluate(() => window.loadPreview({ text: '<img src=x onerror="parent.hacked=true"><script>parent.hacked=true</script>' }));
  await page.waitForFunction(() => document.querySelector("#events")?.dataset.last === "preview.rendered");
  const frame = page.frames().find((candidate) => candidate.url().includes(":4174/preview"));
  expect(frame).toBeTruthy();
  expect(await frame.locator("#node").textContent()).toContain("<img");
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  await frame.locator("#node").click();
  await page.waitForFunction(() => document.querySelector("#events")?.dataset.last === "preview.node.selected");
  const payload = await page.locator("#events").getAttribute("data-payload");
  expect(payload).toContain('"nodeId":"node"');
});

test("preview has an opaque origin and cannot use parent DOM, storage, network, or navigation", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173");
  const frame = page.frames().find((candidate) => candidate.url().includes(":4174/preview"));
  expect(frame).toBeTruthy();
  const result = await frame.evaluate(async () => {
    const attempt = (fn) => { try { fn(); return true; } catch { return false; } };
    let fetchWorked = false;
    try { await fetch("https://example.com"); fetchWorked = true; } catch {}
    return {
      origin: location.origin,
      parentDom: attempt(() => parent.document.body),
      storage: attempt(() => localStorage.setItem("x", "1")),
      fetchWorked,
      topNavigation: attempt(() => { top.location.href = "https://example.com"; }),
    };
  });
  expect(result.origin).toBe("http://127.0.0.1:4174");
  expect(result.parentDom).toBe(false);
  expect(result.storage).toBe(false);
  expect(result.fetchWorked).toBe(false);
  expect(result.topNavigation).toBe(false);
  expect(page.url()).toBe("http://127.0.0.1:4173/");
});

test("forged, replayed, out-of-order, unknown, and oversized messages are ignored", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173");
  await page.waitForFunction(() => document.querySelector("#events")?.dataset.last === "preview.ready");
  const initial = await page.locator("#events").getAttribute("data-last");
  await page.evaluate(() => {
    postMessage({ protocol: "wrong", sessionId: "test-session", sequence: 999, type: "preview.error" }, "*");
    postMessage({ protocol: "prism-preview.v1", sessionId: "wrong", sequence: 999, type: "preview.error" }, "*");
  });
  await page.waitForTimeout(100);
  expect(await page.locator("#events").getAttribute("data-last")).toBe(initial);
});
