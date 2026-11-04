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

  test('saves the latest run locally for a guest and overwrites it on the next run', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: false });
    await page.locator('#start-button').click();
    const firstPrompt = await page.locator('#typing-prompt').innerText();
    await page.locator('#typing-input').fill(firstPrompt);

    const firstRun = await page.evaluate(() => JSON.parse(localStorage.getItem('questline-type-sprint-latest-run')));
    expect(firstRun.version).toBe(1);
    expect(firstRun.prompt).toBe(firstPrompt);
    expect(firstRun.typedText).toBe(firstPrompt);
    expect(firstRun.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstRun.submittedUserId).toBeNull();

    await page.locator('#again-button').click();
    const secondPrompt = await page.locator('#typing-prompt').innerText();
    await page.locator('#typing-input').fill(secondPrompt);
    const secondRun = await page.evaluate(() => JSON.parse(localStorage.getItem('questline-type-sprint-latest-run')));
    expect(secondRun.requestId).not.toBe(firstRun.requestId);
    expect(secondRun.prompt).toBe(secondPrompt);
  });

  test('pushes the latest local run when the user is authenticated', async ({ page }) => {
    await openPage(page, '/typing.html', { authenticated: true });
    await page.locator('#start-button').click();
    const prompt = await page.locator('#typing-prompt').innerText();
    await page.locator('#typing-input').fill(prompt);

    await expect.poll(async () => page.evaluate(() => window.__mockCalls.filter(call => call.name === 'complete_typing_round').length)).toBe(1);
    const call = await page.evaluate(() => window.__mockCalls.find(entry => entry.name === 'complete_typing_round'));
    expect(call.args.p_prompt).toBe(prompt);
    expect(call.args.p_typed_text).toBe(prompt);
    expect(call.args.p_duration_seconds).toBe(30);
    expect(call.args.p_prompt_pack).toBe('sentences');

    const savedRun = await page.evaluate(() => JSON.parse(localStorage.getItem('questline-type-sprint-latest-run')));
    expect(savedRun.submittedUserId).toBe('11111111-1111-4111-8111-111111111111');
    expect(savedRun.serverResult.wpm).toBe(42);
  });
});
