import { expect } from '@playwright/test';
import { mockSupabase } from '../fixtures.mjs';

export async function openPage(page, url, options = {}) {
  page.on('pageerror', error => console.log(`PAGEERROR ${url}: ${error.message}`));
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    contentType: 'text/javascript',
    body: mockSupabase(options),
  }));
  await page.goto(url);
}

export async function openAuthenticatedPage(page, url, options = {}) {
  await openPage(page, url, options);
  await expect(page.locator('body')).toBeVisible();
}
