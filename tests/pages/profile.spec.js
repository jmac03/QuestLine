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

  test('persists the profile default song and applies it on another page', async ({ page }) => {
    await openPage(page, '/profile.html');
    await expect(page.locator('#default-song-select')).toBeEnabled();
    await page.locator('#default-song-select').selectOption('number-roller');
    await page.goto('/typing.html');
    await expect(page.locator('.music-title')).toHaveText('Number Roller');
    await expect(page.locator('#background-music')).toHaveAttribute('src', /Number_Roller\.wav/);
  });

  test('keeps guest and signed-in music preferences in separate storage keys', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.locator('.music-song-select').selectOption('number-roller');
    const signedPage = await page.context().newPage();
    await openPage(signedPage, '/profile.html');
    await expect(signedPage.locator('#default-song-select')).toBeEnabled();
    await signedPage.locator('#default-song-select').selectOption('number-roller');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some(key => key.endsWith('guest'))).toBe(true);
    expect(keys.some(key => key.endsWith('11111111-1111-4111-8111-111111111111'))).toBe(true);
    await signedPage.close();
  });
});
