import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Type Sprint game', () => {
  test('starts a round and completes a prompt', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.locator('#start-button').click();
    await expect(page.locator('#game-panel')).toBeVisible();
    const prompt = await page.locator('#typing-prompt').innerText();
    await page.locator('#typing-input').fill(prompt);
    await expect(page.locator('#result-panel')).toBeVisible();
    await expect(page.locator('#result-characters')).not.toHaveText('0');
  });

  test('changes duration and prompt-pack settings', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.getByRole('button', { name: '60 sec' }).click();
    await page.getByRole('button', { name: 'Word bursts' }).click();
    await expect(page.getByRole('button', { name: '60 sec' })).toHaveClass(/is-selected/);
    await expect(page.getByRole('button', { name: 'Word bursts' })).toHaveClass(/is-selected/);
    await expect(page.locator('#pack-note-title')).toHaveText('Word burst pack');
  });

  test('supports new prompt, quit, replay, and settings navigation', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.locator('#start-button').click();
    await page.locator('#new-prompt-button').click();
    await page.locator('#quit-button').click();
    await expect(page.locator('#result-panel')).toBeVisible();
    await page.locator('#change-settings-button').click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await page.locator('#start-button').click();
    await page.locator('#quit-button').click();
    await page.locator('#again-button').click();
    await expect(page.locator('#game-panel')).toBeVisible();
  });

  test('calculates reduced accuracy for incorrect input', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.locator('#start-button').click();
    const prompt = await page.locator('#typing-prompt').innerText();
    const incorrect = `${prompt.slice(0, -1)}${prompt.endsWith('x') ? 'y' : 'x'}`;
    await page.locator('#typing-input').fill(incorrect);
    await expect(page.locator('#result-panel')).toBeVisible();
    await expect(page.locator('#result-accuracy')).not.toHaveText('100');
  });

  test('persists the best WPM locally and preserves it when a later run is slower', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.evaluate(() => localStorage.setItem('questline-type-sprint-best', '999'));
    await page.reload();
    await expect(page.locator('#best-wpm')).toHaveText('999');
    await page.locator('#start-button').click();
    const prompt = await page.locator('#typing-prompt').innerText();
    await page.locator('#typing-input').fill(prompt);
    await expect(page.locator('#best-wpm')).toHaveText('999');
    await page.reload();
    await expect(page.locator('#best-wpm')).toHaveText('999');
  });
});
