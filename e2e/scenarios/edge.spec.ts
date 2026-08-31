import { test, expect } from '../fixtures/luxia.fixture';
import { OperatorBot } from '../personas/operatorBot';
import { ChaosMonkeyBot } from '../personas/chaosMonkeyBot';

test.describe('Edge Cases & Idempotency Scenarios', () => {
  test('EDGE-001: Zero or invalid dimensions block calculation and disable Add button', async ({
    page,
    sandbox,
  }) => {
    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    await bot.selectFabric('Screen', '1%', 'White');
    await bot.setDimensions(0, 0, 1);

    const addBtn = page.locator('button.pv2-btn-add-inline, button[aria-label="Agregar persiana al lote"]').first();
    const isAddDisabled = await addBtn.isDisabled();
    expect(isAddDisabled).toBe(true);
  });

  test('EDGE-002: Oversized curtain > 3.00m requires rotated fabrication confirmation', async ({
    page,
    sandbox,
  }) => {
    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    await bot.selectFabric('Screen', '1%', 'White');
    await bot.setDimensions(3.20, 2.40, 1);

    // Button should be blocked until confirmed
    const addBtn = page.locator('button.pv2-btn-add-inline, button[aria-label="Agregar persiana al lote"]').first();
    const isAddDisabledInitially = await addBtn.isDisabled();
    expect(isAddDisabledInitially).toBe(true);

    // Confirm alert
    await bot.confirmAlertsIfNeeded();
    const canNowAdd = await addBtn.isEnabled();
    expect(canNowAdd).toBe(true);
  });

  test('EDGE-003: IDEMPOTENCY - Rapid double clicking Save button produces exactly 1 order mutation', async ({
    page,
    sandbox,
  }) => {
    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    await bot.selectFabric('Screen', '1%', 'White');
    await bot.setDimensions(1.50, 1.80, 1);
    await bot.addCurtainToBatch();

    const orderNumber = `ORD-IDEMPOTENT-${Date.now()}`;
    await bot.setOrderNumber(orderNumber);

    // Rapid double click Save button
    const saveBtn = page.locator('button.pv2-btn-save-order, button:has-text("Guardar Orden")').first();
    await saveBtn.click();
    await saveBtn.click({ force: true }).catch(() => {});

    await page.waitForTimeout(1000);

    // Verify exactly 1 order exists with this order number
    const matchingOrders = sandbox.state.orders.filter((o) => o.order_number === orderNumber);
    expect(matchingOrders.length).toBe(1);
  });
});
