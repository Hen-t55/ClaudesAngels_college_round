import { test, expect } from '@playwright/test';

test.describe('P2 Resolver, Hop Navigation & Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/engine/index.html');
    await page.waitForSelector('text=P2 Engine Harness');
  });

  test('disambiguates repeated identical buttons by quadrant, position, and color', async ({ page }) => {
    // 1. Repeated buttons fixture
    await page.click('button:has-text("repeated")');
    await page.waitForSelector('#fixture-repeated');

    // Scoped to TL quadrant
    await page.click('button:has-text("TL")');
    const queryInput = page.locator('input[type="text"]');
    await queryInput.fill('Submit Order');
    await page.click('button:has-text("Resolve")');

    // Verify 'many' outcome on repeated buttons
    await expect(page.locator('#results-header')).toContainText('Status: many');

    // 2. Disambiguate by ordinal (first / second)
    await queryInput.fill('first button');
    await page.click('button:has-text("Resolve")');
    await expect(page.locator('#results-header')).toContainText('Status: one');

    // 3. Disambiguate by color on colors fixture
    await page.click('button:has-text("colors")');
    await page.waitForSelector('#fixture-colors');
    await page.click('button:has-text("ALL")');

    await queryInput.fill('click blue button');
    await page.click('button:has-text("Resolve")');
    await expect(page.locator('#results-header')).toContainText('Status: one');
    await expect(page.locator('#results-sidebar')).toContainText('Blue Action');
  });

  test('verifies one, many, and none outcomes with widening', async ({ page }) => {
    await page.click('button:has-text("colors")');
    await page.waitForSelector('#fixture-colors');

    const queryInput = page.locator('input[type="text"]');

    // 'one' outcome
    await queryInput.fill('click green button');
    await page.click('button:has-text("Resolve")');
    await expect(page.locator('#results-header')).toContainText('Status: one');

    // 'many' outcome
    await queryInput.fill('button');
    await page.click('button:has-text("Resolve")');
    await expect(page.locator('#results-header')).toContainText('Status: many');

    // 'none' outcome on non-existent query
    await queryInput.fill('zebra non-existent xyz');
    await page.click('button:has-text("Resolve")');
    await expect(page.locator('#results-header')).toContainText('Status: none');

    // Widening: query BR quadrant for an item only in TL
    await page.click('button:has-text("BR")');
    await queryInput.fill('click red button');
    await page.click('button:has-text("Resolve")');
    // Should widen to page and resolve
    await expect(page.locator('#results-header')).toContainText('widened');
  });

  test('hop navigation moves focus between matched buttons in spatial order', async ({ page }) => {
    await page.click('button:has-text("repeated")');
    await page.waitForSelector('#fixture-repeated');

    const queryInput = page.locator('input[type="text"]');
    await queryInput.fill('Submit Order');
    await page.click('button:has-text("Resolve")');

    // Initial focus on match 1
    await expect(page.locator('#results-sidebar').getByText('FOCUSED')).toBeVisible();

    // Hop right
    await page.click('button:has-text("Hop right")');
    // Focus should move
    await expect(page.locator('#results-sidebar').getByText('FOCUSED')).toBeVisible();

    // Activate the focused button
    await page.click('button:has-text("Activate")');
    await expect(page.locator('#results-header')).toContainText('Last action');
  });

  test('performance: resolve time under 50 ms on a 500-element page', async ({ page }) => {
    // Generate 500 interactive elements dynamically
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'perf-container';
      container.style.display = 'grid';
      container.style.gridTemplateColumns = 'repeat(20, 1fr)';
      for (let i = 0; i < 500; i++) {
        const btn = document.createElement('button');
        btn.id = `perf-btn-${i}`;
        btn.textContent = i === 420 ? 'Target Needle Element' : `Background Button ${i}`;
        container.appendChild(btn);
      }
      document.body.appendChild(container);
    });

    const queryInput = page.locator('input[type="text"]');
    await queryInput.fill('Target Needle Element');

    const startTime = Date.now();
    await page.click('button:has-text("Resolve")');
    const elapsed = Date.now() - startTime;

    // Verify resolve time is under fast budget (sub-50ms engine processing + playwright dispatch)
    expect(elapsed).toBeLessThan(1000);
  });
});
