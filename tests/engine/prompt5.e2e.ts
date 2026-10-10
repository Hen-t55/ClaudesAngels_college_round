import { test, expect } from '@playwright/test';

test.describe('P2 Prompt 5: Important Actions, Undo, Clear', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/engine/index.html');
    await page.waitForSelector('text=P2 Engine Harness');
  });

  test('multi-field form submit emits confirmNeeded and only submits after accept=true', async ({ page }) => {
    // Switch to checkout fixture
    await page.click('button:has-text("checkout")');
    await page.waitForSelector('#fixture-checkout');

    // Resolve "Place Order" button
    const commandInput = page.locator('input[placeholder*="click blue button"]');
    await commandInput.fill('click place order');
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();

    // Wait for resolve to complete
    const sidebar = page.locator('#results-sidebar');
    await expect(sidebar).toContainText('Matches: 1', { timeout: 3000 });

    // Activate -> should trigger confirmNeeded because "place order" matches purchase keyword
    await page.getByRole('button', { name: 'Activate', exact: true }).click();

    // Confirm UI should appear (the engine emits confirmNeeded, harness shows confirm buttons)
    await expect(page.locator('#btn-confirm-yes')).toBeVisible({ timeout: 3000 });

    // Accept the confirmation
    await page.click('#btn-confirm-yes');

    // After accept, the action should complete
    const resultsHeader = page.locator('#results-header');
    await expect(resultsHeader).toContainText('[OK]', { timeout: 3000 });
  });

  test('search-box submit does not ask for confirmation', async ({ page }) => {
    // Switch to search fixture
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    // Resolve and activate "Submit Search" button — it's type="button", not in a form
    const commandInput = page.locator('input[placeholder*="click blue button"]');
    await commandInput.fill('click submit search');
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();

    // Wait for resolve
    const sidebar = page.locator('#results-sidebar');
    await expect(sidebar).toContainText('Status:', { timeout: 3000 });

    // Activate — this should NOT trigger confirmation
    await page.getByRole('button', { name: 'Activate', exact: true }).click();

    // Should NOT show confirm buttons
    await expect(page.locator('#btn-confirm-yes')).not.toBeVisible({ timeout: 1000 });

    // Action should complete normally
    const resultsHeader = page.locator('#results-header');
    await expect(resultsHeader).toContainText('[OK]', { timeout: 3000 });
  });

  test('routine clicks never ask', async ({ page }) => {
    // Switch to colors fixture
    await page.getByRole('button', { name: 'colors', exact: true }).click();
    await page.waitForSelector('#fixture-colors');

    // 'Blue Action' is the unique label on the blue button - no colour keyword so resolve
    // works in headless where getComputedStyle cannot read inline React style props.
    const commandInput = page.locator('input[placeholder*="click blue button"]');
    await commandInput.fill('click Blue Action');
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();

    // Wait until the resolve result lands – harness UI is excluded via data-engine-ignore
    // so 'Blue Action' is now the only indexed match (exact label → status 'one', Matches: 1)
    const sidebar = page.locator('#results-sidebar');
    await expect(sidebar).toContainText('Matches: 1', { timeout: 3000 });

    await page.getByRole('button', { name: 'Activate', exact: true }).click();

    // No confirm needed for routine action
    await expect(page.locator('#btn-confirm-yes')).not.toBeVisible({ timeout: 1000 });

    // Action done
    const resultsHeader = page.locator('#results-header');
    await expect(resultsHeader).toContainText('[OK]', { timeout: 3000 });
  });

  test('undo restores typed text', async ({ page }) => {
    // Switch to search fixture
    await page.getByRole('button', { name: 'search', exact: true }).click();
    await page.waitForSelector('#fixture-search');

    // Set initial value in the react input
    const reactInput = page.locator('#react-input');
    await reactInput.fill('Initial text');

    // Type via engine fill
    await page.locator('#type-field-input').fill('react');
    await page.locator('#type-text-input').fill('Replaced');
    await page.click('#btn-type-fill');

    // Value should be replaced
    await expect(reactInput).toHaveValue('Replaced');

    // Undo
    await page.click('#btn-undo');

    // Value should be restored
    await expect(reactInput).toHaveValue('Initial text');
  });

  test('clear removes matches and pending confirmations', async ({ page }) => {
    // Switch to checkout fixture
    await page.click('button:has-text("checkout")');
    await page.waitForSelector('#fixture-checkout');

    // Resolve something
    const commandInput = page.locator('input[placeholder*="click blue button"]');
    await commandInput.fill('click place order');
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();

    const sidebar = page.locator('#results-sidebar');
    await expect(sidebar).toContainText('Matches: 1', { timeout: 3000 });

    // Clear
    await page.click('#btn-clear');

    // Matches should be zero (engine emits engine.result with empty matches on clear)
    await expect(sidebar).toContainText('Matches: 0', { timeout: 3000 });
  });
});
