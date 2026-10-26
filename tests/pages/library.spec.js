import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Library page', () => {
  test('renders the game catalog and navigation', async ({ page }) => {
    await openPage(page, '/index.html', { authenticated: false });
    await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Play Number Roll' })).toHaveAttribute('href', 'number-roll.html');
    await expect(page.getByRole('link', { name: 'Play Type Sprint' })).toHaveAttribute('href', 'typing.html');
    await expect(page.getByRole('link', { name: 'Open Rewards' })).toHaveAttribute('href', 'rewards.html');
  });

  test('shows the signed-out account state', async ({ page }) => {
    await openPage(page, '/index.html', { authenticated: false });
    await expect(page.locator('#profile-name')).toHaveText('Profile');
    await expect(page.locator('#profile-avatar')).toHaveText('?');
  });
});
