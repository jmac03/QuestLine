import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Number Roll game', () => {
  test('gates signed-out users', async ({ page }) => {
    await openPage(page, '/number-roll.html', { authenticated: false });
    await expect(page.locator('#login-required')).toBeVisible();
    await expect(page.locator('#roll-game')).toBeHidden();
  });

  test('maps server state into energy, scores, history, and badges', async ({ page }) => {
    await openPage(page, '/number-roll.html');
    await expect(page.locator('#energy-label')).toHaveText('3 / 10');
    await expect(page.locator('#total-score')).toHaveText('120');
    await expect(page.locator('#best-score')).toHaveText('80');
    await expect(page.locator('#history-list')).toContainText('Close To Average');
    await expect(page.locator('#history-list')).toContainText('17');
  });

  test('updates score, energy, latest roll, rarity, badges, and history', async ({ page }) => {
    await openPage(page, '/number-roll.html');
    await page.locator('#roll-button').click();
    await expect(page.locator('#result-number')).toHaveText('42');
    await expect(page.locator('#result-rarity')).toHaveText('Rare');
    await expect(page.locator('#result-score')).toHaveText('+15 points');
    await expect(page.locator('#badge-list')).toContainText('Lucky Number');
    await expect(page.locator('#total-score')).toHaveText('135');
    await expect(page.locator('#best-score')).toHaveText('95');
    await expect(page.locator('#energy-label')).toHaveText('2 / 10');
  });

  test('refreshes authoritative state and reward progress after a roll', async ({ page }) => {
    await openPage(page, '/number-roll.html', { rewardPoints: 10 });
    await page.locator('#roll-button').click();
    const stateCalls = await page.evaluate(() => window.__mockCalls.filter(call => call.name === 'get_roll_state').length);
    expect(stateCalls).toBeGreaterThanOrEqual(2);
    await page.goto('/rewards.html');
    await expect(page.locator('#reward-points')).toHaveText('11');
    await expect(page.locator('.reward-track-card')).toContainText('11 points');
  });

  test('does not render a fake result when the roll RPC fails', async ({ page }) => {
    await openPage(page, '/number-roll.html', { rollError: 'roll_number failed' });
    await page.locator('#roll-button').click();
    await expect(page.locator('#roll-status')).toHaveText('roll_number failed');
    await expect(page.locator('#result-number')).toHaveText('17');
  });
});
