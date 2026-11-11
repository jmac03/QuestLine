import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Wordle game', () => {
  test('gates signed-out users', async ({ page }) => {
    await openPage(page, '/wordle.html', { authenticated: false });
    await expect(page.locator('#login-required')).toBeVisible();
    await expect(page.locator('#wordle-game')).toBeHidden();
  });

  test('starts with the selected settings and renders feedback rows', async ({ page }) => {
    await openPage(page, '/wordle.html');
    await page.locator('#word-length').selectOption('5');
    await page.locator('#max-guesses').selectOption('6');
    await page.locator('#start-button').click();
    await expect(page.locator('#play-panel')).toBeVisible();
    await expect(page.locator('.board-row')).toHaveCount(6);
    await page.locator('#guess-input').fill('crane');
    await page.locator('#guess-form').press('Enter');
    await expect(page.locator('.tile.correct')).toHaveCount(1);
    await expect(page.locator('#guess-count')).toHaveText('1 / 6');
  });

  test('shows the score and answer when the last guess completes the game', async ({ page }) => {
    await openPage(page, '/wordle.html');
    await page.locator('#start-button').click();
    await page.locator('#guess-input').fill('cabin');
    await page.locator('#guess-form').press('Enter');
    await expect(page.locator('#result-panel')).toBeVisible();
    await expect(page.locator('#result-score')).not.toHaveText('');
    await expect(page.locator('#result-answer')).not.toHaveText('—');
  });
});
