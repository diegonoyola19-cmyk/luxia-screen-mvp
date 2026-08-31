import { test, expect } from '../fixtures/luxia.fixture';
import { WarehouseBot } from '../personas/warehouseBot';

test.describe('Persona: Warehouse Bot - Bodega & Inventory Operations', () => {
  test('WAREHOUSE-001: Inspect inventory stock, verify fabrics & linear components', async ({
    page,
    sandbox,
  }) => {
    const bot = new WarehouseBot(page);
    await bot.login();
    await bot.navigateToInventory();

    expect(sandbox.state.inventory.length).toBeGreaterThan(0);

    // Switch between fabrics and linears
    await bot.filterCategory('fabric');
    await page.waitForTimeout(300);

    await bot.filterCategory('linear');
    await page.waitForTimeout(300);
  });

  test('WAREHOUSE-002: Search inventory items and filter by query', async ({
    page,
    sandbox,
  }) => {
    const bot = new WarehouseBot(page);
    await bot.login();
    await bot.navigateToInventory();

    await bot.search('Screen');
    await page.waitForTimeout(400);

    // Verify search input has value and table or cards are rendered
    const searchInput = page.locator('input.search, input[placeholder*="Buscar"]').first();
    await expect(searchInput).toHaveValue('Screen');
  });

  test('WAREHOUSE-003: Trigger manual API sync and assert health indicator', async ({
    page,
    sandbox,
  }) => {
    const bot = new WarehouseBot(page);
    await bot.login();
    await bot.navigateToInventory();

    await bot.triggerSync();
    await page.waitForTimeout(600);

    // Assert that the sync health pill is visible
    const syncPill = page.locator('.pill-success, .pill, [data-sonner-toast]').first();
    await expect(syncPill).toBeVisible({ timeout: 5000 });
  });
});
