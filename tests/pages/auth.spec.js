import { test, expect } from '@playwright/test';
import { openPage } from '../helpers/open-page.mjs';

test.describe('Authentication flow', () => {
  test('opens the sign-in dialog for a protected destination', async ({ page }) => {
    await openPage(page, '/index.html?auth=required&next=number-roll.html', { authenticated: false });
    await expect(page.locator('#auth-dialog')).toBeVisible();
    await expect(page.locator('#auth-submit')).toHaveText('Sign in');
  });

  test('switches between sign-in and account-creation modes', async ({ page }) => {
    await openPage(page, '/index.html?auth=required', { authenticated: false });
    await page.locator('#sign-up-tab').click();
    await expect(page.locator('#auth-title')).toHaveText('Create your account');
    await expect(page.locator('#auth-submit')).toHaveText('Create account');
    await page.locator('#sign-in-tab').click();
    await expect(page.locator('#auth-title')).toHaveText('Welcome back');
  });
});
