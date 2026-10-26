import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Rewards page', () => {
  test('renders selected track progress and milestones', async ({ page }) => {
    await openPage(page, '/rewards.html');
    await expect(page.locator('.reward-track-card')).toBeVisible();
    await expect(page.locator('.reward-track-card')).toContainText('10 points');
    await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByRole('button', { name: 'Claim song' })).toBeVisible();
  });

  test('claims a reached song milestone with only its milestone ID', async ({ page }) => {
    await openPage(page, '/rewards.html');
    await page.getByRole('button', { name: 'Claim song' }).click();
    await expect.poll(() => page.evaluate(() => window.__mockCalls.find(call => call.type === 'function')?.options?.body)).toEqual({
      milestone_id: '33333333-3333-4333-8333-333333333333',
    });
  });

  test('hides authenticated reward data when signed out', async ({ page }) => {
    await openPage(page, '/rewards.html', { authenticated: false });
    await expect(page.locator('#reward-status')).toContainText('Sign in');
    await expect(page.locator('.reward-track-card')).toHaveCount(0);
  });
});
