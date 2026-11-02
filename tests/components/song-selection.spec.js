import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Basic Song Selection setup', () => {
  test('loads the built-in song and default choices for a guest', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await expect(page.locator('.music-song-select')).toBeVisible();
    await expect(page.locator('.music-title')).toHaveText('Racing The Weave');
    await expect(page.locator('.music-song-select option')).toHaveCount(4);
    await expect(page.locator('.music-song-select option[value="fire-behind-the-weave"]')).toHaveCount(0);
  });

  test('adds an earned song and switches the page audio selection', async ({ page }) => {
    await openPage(page, '/typing.html', { ownedSongId: 'fire-behind-the-weave' });
    const picker = page.locator('.music-song-select');
    await expect(picker.locator('option[value="fire-behind-the-weave"]')).toHaveCount(1);
    await picker.selectOption('fire-behind-the-weave');
    await expect(page.locator('.music-title')).toHaveText('Fire Behind the Weave');
    await expect(page.locator('#background-music')).toHaveAttribute('src', /Fire_Behind_the_Weave\.wav/);
  });

  test('does not expose a non-default reward song without ownership', async ({ page }) => {
    await openPage(page, '/typing.html');
    const picker = page.locator('.music-song-select');
    await expect(picker.locator('option[value="fire-behind-the-weave"]')).toHaveCount(0);
  });
});
