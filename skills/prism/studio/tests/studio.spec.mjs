import { expect, test } from "@playwright/test";

test("desktop Studio edits the canonical revision and previews it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/");
  await expect(page.locator(".brand strong")).toHaveText("Prism");
  await page.getByRole("button", { name: "Edit text" }).click();
  await expect(page.getByTestId("revision")).toHaveText("Revision 2");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.locator('iframe[title="Isolated prototype preview"]');
  await expect(preview).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.frameLocator('iframe[title="Isolated prototype preview"]').getByRole("heading", { name: "Services" })).toBeVisible();
});

test("mobile Studio uses bottom sheets and supports insert", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "desktop");
  await page.goto("/");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Insert component" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Insert action" }).click();
  await expect(page.getByTestId("revision")).toHaveText("Revision 2");
});

test("Studio has no horizontal page overflow", async ({ page }) => {
  await page.goto("/");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
