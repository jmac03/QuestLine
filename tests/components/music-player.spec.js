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

  test('multiplies page volume by the signed-in master volume and clamps the result', async ({ page }) => {
    await openPage(page, '/profile.html');
    await expect(page.locator('#master-volume')).toBeEnabled();
    await page.locator('#master-volume').fill('0.5');
    await page.locator('#master-volume').dispatchEvent('change');
    await page.locator('#music-volume').fill('1');
    expect(await page.locator('#background-music').evaluate(audio => audio.volume)).toBe(0.5);

    await page.evaluate(() => window.questLineMusic.setMasterVolume(2));
    expect(await page.locator('#background-music').evaluate(audio => audio.volume)).toBe(1);
  });

  test('applies the saved master volume when the page opens', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('questline.music-preferences.11111111-1111-4111-8111-111111111111', JSON.stringify({
        defaultSongId: null,
        pages: {},
        masterVolume: 0.25,
      }));
    });
    await openPage(page, '/profile.html');
    await expect(page.locator('#master-volume')).toHaveValue('0.25');
    await expect.poll(() => page.locator('#background-music').evaluate(audio => audio.volume)).toBe(0.0875);
  });

  test('provides the built-in song and page song selector', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await expect(page.locator('.music-song-select')).toBeVisible();
    await expect(page.locator('.music-song-select option')).toHaveCount(4);
    await expect(page.locator('.music-title')).toHaveText('Racing The Weave');
  });
});
