import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Shared music player', () => {
  test('renders controls and updates volume output', async ({ page }) => {
    await openPage(page, '/index.html', { authenticated: false });
    await expect(page.locator('#music-toggle')).toBeVisible();
    await expect(page.locator('#music-volume')).toBeVisible();
    await page.locator('#music-volume').fill('0.7');
    await expect(page.locator('#music-volume-value')).toHaveText('70%');
  });

  test('provides the built-in song and page song selector', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await expect(page.locator('.music-song-select')).toBeVisible();
    await expect(page.locator('.music-song-select option')).toHaveCount(4);
    await expect(page.locator('.music-title')).toHaveText('Racing The Weave');
  });
});
