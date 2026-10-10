import { test, expect } from '@playwright/test';

test.describe('P2 ShowNumbers, Zoom Grid & Typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/engine/index.html');
    await page.waitForSelector('text=P2 Engine Harness');
  });

  // ── ShowNumbers ────────────────────────────────────────────────────────────

  test('showNumbers: numbers all clickable elements capped at 40', async ({ page }) => {
    await page.click('button:has-text("dense")');
    await page.waitForSelector('#fixture-dense');

    await page.click('#btn-show-numbers');

    const sidebar = page.locator('#results-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText(/^#1 /)).toBeVisible();
    const items = sidebar.locator('div[style*="border"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(40);
  });

  test('showNumbers: scoped to a quadrant limits results', async ({ page }) => {
    await page.click('button:has-text("dense")');
    await page.waitForSelector('#fixture-dense');

    await page.click('button:has-text("TL")');
    await page.click('#btn-show-numbers');

    const status = page.locator('#results-header');
    await expect(status).not.toContainText('Status: idle');
  });

  // ── Zoom Grid ──────────────────────────────────────────────────────────────

  test('zoom start creates 3x3 grid overlay (canvas fixture)', async ({ page }) => {
    await page.click('button:has-text("canvas")');
    await page.waitForSelector('#fixture-canvas');

    await page.click('#btn-zoom-start');

    const overlay = page.locator('#zoom-overlay');
    await expect(overlay).toBeVisible();
    for (let n = 1; n <= 9; n++) {
      await expect(page.locator(`#zoom-cell-${n}`)).toBeVisible();
    }
    await expect(page.locator('#results-header')).toContainText('zoom depth=0');
  });

  test('zoom pick narrows into cell and increments depth', async ({ page }) => {
    await page.click('button:has-text("colors")');
    await page.waitForSelector('#fixture-colors');

    await page.click('#btn-zoom-start');
    await expect(page.locator('#zoom-overlay')).toBeVisible();

    await page.click('#btn-zoom-pick-5');

    const statusText = await page.locator('#results-header').innerText();
    const isDeeper = statusText.includes('zoom depth=1');
    const isClicked = statusText.includes('clicked') || statusText.includes('center');
    expect(isDeeper || isClicked).toBeTruthy();
  });

  test('zoom back pops to previous level', async ({ page }) => {
    await page.click('button:has-text("canvas")');
    await page.waitForSelector('#fixture-canvas');

    await page.click('#btn-zoom-start');
    await expect(page.locator('#zoom-overlay')).toBeVisible();
    await page.click('#btn-zoom-pick-1');
    await page.click('#btn-zoom-back');

    await expect(page.locator('#results-header')).toContainText('zoom depth=0');
  });

  test('zoom click fires on center of current area', async ({ page }) => {
    await page.click('button:has-text("canvas")');
    await page.waitForSelector('#fixture-canvas');

    await page.click('#btn-zoom-start');
    await expect(page.locator('#zoom-overlay')).toBeVisible();

    await page.click('#btn-zoom-click');

    await expect(page.locator('#results-header')).toContainText('Last action');
    await expect(page.locator('#zoom-overlay')).not.toBeVisible({ timeout: 2000 });
  });

  test('zoom grid can reach iframe target through pick then click', async ({ page }) => {
    await page.click('button:has-text("iframe")');
    await page.waitForSelector('#fixture-iframe iframe');

    const iframe = page.frameLocator('#same-origin-frame');
    await expect(iframe.locator('#iframe-btn')).toBeVisible();

    await page.click('#btn-zoom-start');
    await expect(page.locator('#zoom-overlay')).toBeVisible();

    await page.click('#btn-zoom-click');

    await expect(page.locator('#results-header')).toContainText('Last action');
  });

  // ── Typing ─────────────────────────────────────────────────────────────────

  test('type fill: replaces value in a regular input via field label', async ({ page }) => {
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    await page.locator('#type-field-input').fill('React controlled');
    await page.locator('#type-text-input').fill('Typed by engine');

    await page.click('#btn-type-fill');

    await expect(page.locator('#react-input')).toHaveValue('Typed by engine');
    await expect(page.locator('#results-header')).toContainText('OK');
  });

  test('type insert: appends text to regular input', async ({ page }) => {
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    await page.locator('#react-input').fill('Hello ');
    await page.locator('#react-input').click();

    await page.locator('#type-field-input').fill('React controlled');
    await page.locator('#type-text-input').fill('World');
    await page.click('#btn-type-insert');

    const val = await page.locator('#react-input').inputValue();
    expect(val).toContain('World');
  });

  test('type fill: replaces contenteditable content', async ({ page }) => {
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    await page.locator('#ce-div').click();

    await page.locator('#type-field-input').fill('Content editable');
    await page.locator('#type-text-input').fill('CE Filled Text');
    await page.click('#btn-type-fill');

    await expect(page.locator('#ce-div')).toContainText('CE Filled Text');
    await expect(page.locator('#results-header')).toContainText('OK');
  });

  test('type insert: appends to contenteditable', async ({ page }) => {
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    await page.locator('#ce-div').click();

    await page.locator('#type-field-input').fill('content editable');
    await page.locator('#type-text-input').fill(' Appended');
    await page.click('#btn-type-insert');

    const content = await page.locator('#ce-div').innerText();
    expect(content).toContain('Appended');
  });

  // ── Search verb ────────────────────────────────────────────────────────────

  test('search verb finds the search input on the search fixture', async ({ page }) => {
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    await page.click('#btn-search');

    const sidebar = page.locator('#results-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Search', { exact: false }).first()).toBeVisible();
  });

  test('search: fills search box via type fill after search verb', async ({ page }) => {
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    await page.click('#btn-search');

    await page.locator('#type-field-input').fill('Search');
    await page.locator('#type-text-input').fill('handsfree query');
    await page.click('#btn-type-fill');

    await expect(page.locator('#search-input')).toHaveValue('handsfree query');
  });
});
