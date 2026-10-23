import { test, expect } from '@playwright/test';

test('project-owned assertion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toHaveText('E2E ready');
});

test('independent test continues', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

test.skip('project-owned skip', async () => {
  throw new Error('A skipped test must not execute.');
});
