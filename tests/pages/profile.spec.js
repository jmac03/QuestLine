import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Profile page', () => {
  test('renders the signed-in account and music preferences', async ({ page }) => {
    await openPage(page, '/profile.html');
    await expect(page.locator('#profile-account')).toBeVisible();
    await expect(page.locator('#profile-account-email')).toHaveText('tester@example.com');
    await expect(page.locator('#default-song-select')).toBeVisible();
  });

  test('redirects signed-out users to authentication', async ({ page }) => {
    await openPage(page, '/profile.html', { authenticated: false });
    await expect.poll(() => page.url()).toContain('auth=required');
  });
});
