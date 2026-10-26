import { test, expect } from '@playwright/test';

const email = process.env.QUESTLINE_E2E_EMAIL || 'test@example.com';
const password = process.env.QUESTLINE_E2E_PASSWORD || 'Password';

test('real authenticated Number Roll loads and persists a roll', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => Boolean(window.questLineSupabase))).toBe(true);
  const result = await page.evaluate(async credentials => {
    return window.questLineSupabase.auth.signInWithPassword(credentials);
  }, { email, password });
  expect(result.error, JSON.stringify(result.error)).toBeNull();
  await page.goto('/number-roll.html');
  await expect(page.locator('#roll-game')).toBeVisible();
  await expect(page.locator('#roll-button')).toBeEnabled({ timeout: 15_000 });
  await page.locator('#roll-button').click();
  await expect(page.locator('#result-number')).not.toHaveText('—', { timeout: 15_000 });
  await expect(page.locator('#result-score')).toContainText('points');
});
