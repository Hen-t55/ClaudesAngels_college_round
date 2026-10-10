import { test, expect } from '@playwright/test';

test.describe('P2 Engine Dev Harness & Fixtures', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to engine dev harness
    await page.goto('/dev/engine/index.html');
    await page.waitForSelector('text=P2 Engine Harness');
  });

  test('indexes repeated identical buttons fixture', async ({ page }) => {
    await page.click('button:has-text("repeated")');
    await page.waitForSelector('#fixture-repeated');

    // Check repeated buttons rendered and indexed
    const buttons = page.locator('#fixture-repeated button');
    await expect(buttons).toHaveCount(8);

    // Verify index results listed in sidebar
    await expect(page.locator('#results-header')).toBeVisible();
    await expect(page.locator('#results-sidebar').getByText('Submit Order').first()).toBeVisible();
  });

  test('indexes color buttons fixture and extracts color', async ({ page }) => {
    await page.click('button:has-text("colors")');
    await page.waitForSelector('#fixture-colors');

    // Query for blue button
    const queryInput = page.locator('input[type="text"]');
    await queryInput.fill('click blue button');
    await page.click('button:has-text("Resolve")');

    // Expect blue button match
    await expect(page.locator('#results-sidebar').getByText('Blue Action').first()).toBeVisible();
  });

  test('indexes stacked layout and respects ordinal and positional filters', async ({ page }) => {
    await page.click('button:has-text("stacked")');
    await page.waitForSelector('#fixture-stacked');

    const queryInput = page.locator('input[type="text"]');
    await queryInput.fill('second button');
    await page.click('button:has-text("Resolve")');

    await expect(page.locator('#results-sidebar').getByText('Stacked Second').first()).toBeVisible();
  });

  test('indexes form controls and labels', async ({ page }) => {
    await page.click('button:has-text("form")');
    await page.waitForSelector('#fixture-form');

    // Check label extraction for username, email, and submit button
    await expect(page.locator('#results-sidebar').getByText('Username:').first()).toBeVisible();
    await expect(page.locator('#results-sidebar').getByText('Register Now').first()).toBeVisible();
  });

  test('indexes canvas overlay interactive target', async ({ page }) => {
    await page.click('button:has-text("canvas")');
    await page.waitForSelector('#fixture-canvas');

    await expect(page.locator('#results-sidebar').getByText('Canvas Node 1').first()).toBeVisible();
  });

  test('indexes same-origin iframe elements', async ({ page }) => {
    await page.click('button:has-text("iframe")');
    await page.waitForSelector('#fixture-iframe iframe');

    // Wait for iframe content to be rendered
    const iframe = page.frameLocator('#same-origin-frame');
    await expect(iframe.locator('#iframe-btn')).toBeVisible();

    // Trigger reindex
    await page.click('button:has-text("Resolve")');

    // Verify iframe elements are present in the indexed list
    await expect(page.locator('#results-sidebar').getByText('Inside Frame Button', { exact: true })).toBeVisible();
  });

  test('indexes dense link list and assigns quadrants correctly', async ({ page }) => {
    await page.click('button:has-text("dense")');
    await page.waitForSelector('#fixture-dense');

    const links = page.locator('#fixture-dense a');
    await expect(links).toHaveCount(25);

    // Verify quadrant filter buttons (e.g. TL)
    await page.click('button:has-text("TL")');
    await expect(page.locator('#results-header')).toBeVisible();
  });
});
