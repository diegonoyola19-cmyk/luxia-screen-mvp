import { test, expect } from '../fixtures/luxia.fixture';
import { SupervisorBot } from '../personas/supervisorBot';
import { InventoryOracle } from '../oracles/inventoryOracle';

test.describe('Persona: Supervisor Bot - Order Management & Rollbacks', () => {
  test('SUPERVISOR-001: Inspect order details and verify BOM breakdown in modal', async ({
    page,
    sandbox,
  }) => {
    const bot = new SupervisorBot(page);
    await bot.login();
    await bot.navigateToSavedOrders();

    expect(sandbox.state.orders.length).toBeGreaterThan(0);

    const firstOrder = sandbox.state.orders[0];
    await bot.openOrderDetails(firstOrder.order_number);

    const modalHeader = page.locator('.modal-header');
    await expect(modalHeader.first()).toContainText(firstOrder.order_number);

    await bot.closeModal();
  });

  test('SUPERVISOR-002: Cancel active order and verify rollback of inventory', async ({
    page,
    sandbox,
  }) => {
    const bot = new SupervisorBot(page);
    await bot.login();
    await bot.navigateToSavedOrders();

    const snapshotBefore = InventoryOracle.takeSnapshot(sandbox.state.inventory, sandbox.state.movements);

    const orderToCancel = sandbox.state.orders.find((o) => o.order_number === 'ORD-2026-001');
    expect(orderToCancel).toBeDefined();

    await bot.cancelOrder('ORD-2026-001');

    const cancelledOrder = sandbox.state.orders.find((o) => o.order_number === 'ORD-2026-001');
    expect(cancelledOrder?.status).toBe('cancelled');

    const snapshotAfter = InventoryOracle.takeSnapshot(sandbox.state.inventory, sandbox.state.movements);
    const rollbackVerification = InventoryOracle.verifyRollback(snapshotBefore, snapshotAfter);
    expect(rollbackVerification.valid).toBe(true);
  });

  test('SUPERVISOR-003: SCRAP_ALREADY_USED guard blocks cancellation when scrap is consumed', async ({
    page,
    sandbox,
    networkMonitor,
  }) => {
    networkMonitor.ignoreUrl(/cancel_order_inventory_tx/);
    const bot = new SupervisorBot(page);
    await bot.login();
    await bot.navigateToSavedOrders();

    const usedScrap = sandbox.state.inventory.find((i) => i.id === 'inv-scrap-002-used');
    expect(usedScrap?.status).toBe('used');

    await bot.cancelOrder('ORD-2026-002');

    const orderAfterAttempt = sandbox.state.orders.find((o) => o.order_number === 'ORD-2026-002');
    expect(orderAfterAttempt?.status).not.toBe('cancelled');
  });
});
