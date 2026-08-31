import { test, expect } from '../fixtures/luxia.fixture';
import { OperatorBot } from '../personas/operatorBot';
import { BomOracle } from '../oracles/bomOracle';
import { CuttingOracle } from '../oracles/cuttingOracle';
import { TestDataFactory } from '../helpers/testDataFactory';

test.describe('Persona: Operator Bot - Cutting & Production Scenarios', () => {
  test('OPERATOR-001: Configure 1 standard curtain, verify BOM oracle & save order in sandbox', async ({
    page,
    sandbox,
  }) => {
    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    // 1. Select Fabric
    await bot.selectFabric('Screen', '1%', 'White');

    // 2. Set dimensions 1.80m x 2.20m
    await bot.setDimensions(1.80, 2.20, 1);

    // 3. Verify with BOM Oracle
    const expectedBom = BomOracle.calculateExpectedCurtain(1.80, 2.20, 'standard', 'white');
    expect(expectedBom.cutWidthMeters).toBe(1.90);
    expect(expectedBom.cutHeightMeters).toBe(2.45);
    expect(expectedBom.tubeCutMeters).toBe(1.77);
    expect(expectedBom.bottomrailCutMeters).toBe(1.77);

    // 4. Add to batch
    await bot.addCurtainToBatch();

    // 5. Inspect cutting preview
    const preview = await bot.inspectCuttingPreview();
    expect(preview.curtainCount).toBe(1);

    // 6. Set Order number and Save
    const orderNumber = `ORD-OP-${Date.now()}`;
    await bot.setOrderNumber(orderNumber);
    await bot.saveBatchOrder();
    await page.waitForTimeout(800);

    // 7. Verify sandbox state has the new order
    const savedOrder = sandbox.state.orders.find((o) => o.order_number === orderNumber);
    expect(savedOrder).toBeDefined();
    expect(savedOrder?.status).toBe('ready_for_production');
  });

  test('OPERATOR-002: Batch optimization of 5 curtains with Cutting Oracle validation', async ({
    page,
    sandbox,
  }) => {
    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    await bot.selectFabric('Screen', '1%', 'White');

    const curtains = TestDataFactory.createStandardCurtains(5);
    for (const c of curtains) {
      await bot.setDimensions(c.widthMeters, c.heightMeters, 1);
      await bot.addCurtainToBatch();
    }

    const preview = await bot.inspectCuttingPreview();
    expect(preview.curtainCount).toBe(5);

    // Verify Cutting Oracle expectations
    const widths = curtains.map((c) => c.widthMeters);
    const expectedRow = CuttingOracle.calculateExpectedRow(widths.slice(0, 2), [2.50, 3.00]);
    expect(expectedRow.wasteWidth).toBeGreaterThanOrEqual(0);
    expect(expectedRow.efficiencyPct).toBeGreaterThan(0);

    const orderNumber = `ORD-OP-BATCH5-${Date.now()}`;
    await bot.setOrderNumber(orderNumber);
    await bot.saveBatchOrder();
    await page.waitForTimeout(800);

    const savedOrder = sandbox.state.orders.find((o) => o.order_number === orderNumber);
    expect(savedOrder).toBeDefined();
  });

  test('OPERATOR-003: Large 10-curtain production batch calculation', async ({
    page,
    sandbox,
  }) => {
    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    await bot.selectFabric('Screen', '1%', 'White');

    // Add 10 curtains by entering quantity 10
    await bot.setDimensions(1.50, 2.00, 10);
    await bot.addCurtainToBatch();

    const preview = await bot.inspectCuttingPreview();
    expect(preview.curtainCount).toBe(10);

    const orderNumber = `ORD-OP-BATCH10-${Date.now()}`;
    await bot.setOrderNumber(orderNumber);
    await bot.saveBatchOrder();
    await page.waitForTimeout(800);

    const saved = sandbox.state.orders.find((o) => o.order_number === orderNumber);
    expect(saved).toBeDefined();
  });
});
