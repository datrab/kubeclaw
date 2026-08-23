import { expect, test } from "@playwright/test";

test("mobile controls insert, duplicate, move, delete, persist, and set compact scope", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.locator("iframe").contentFrame().getByText("Deployments", { exact: true })).toBeVisible();
  const startRevision = await page.getByTestId("revision").textContent();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByRole("button", { name: "Move up", exact: true }).click();
  await page.getByRole("button", { name: "Move down", exact: true }).click();
  await page.getByRole("button", { name: "Delete last", exact: true }).click();
  await page.getByRole("button", { name: /Viewport:/ }).click();
  await expect(page.getByRole("button", { name: "Viewport: compact only" })).toBeVisible();
  await expect(page.getByTestId("revision")).not.toHaveText(startRevision ?? "");
  const saved = await page.evaluate(() => localStorage.getItem("prism-mobile-spike"));
  expect(saved).toContain("status");
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("prism-mobile-spike"))).toBe(saved);
});

test("touch canvas scroll does not trigger an editor action", async ({ page }) => {
  await page.goto("/");
  const before = Number(await page.getByTestId("action-count").textContent());
  await page.touchscreen.tap(200, 700);
  await page.mouse.wheel(0, 400);
  const after = Number(await page.getByTestId("action-count").textContent());
  expect(after).toBe(before);
});

test("all movement has a non-drag control with a mobile-size touch target", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Move up", "Move down", "Insert", "Duplicate", "Delete last"]) {
    const button = page.getByRole("button", { name, exact: true });
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test("Puck property editing writes the saved mobile revision", async ({ page }) => {
  await page.goto("/");
  const frame = page.locator("iframe").contentFrame();
  await frame.getByText("Deployments", { exact: true }).click();
  const fieldsTab = page.getByText("Fields", { exact: true });
  if (await fieldsTab.isVisible()) await fieldsTab.click();
  const field = page.getByRole("textbox", { name: "text" });
  await field.click();
  await field.press("ControlOrMeta+A");
  await field.pressSequentially("Services");
  await field.press("Tab");
  await expect(frame.getByText("Services", { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("prism-mobile-spike"))).toContain("Services");
});
