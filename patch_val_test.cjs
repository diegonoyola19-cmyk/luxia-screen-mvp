const fs = require('fs');
let c = fs.readFileSync('src/domain/orders/__tests__/validateOrderBeforeSage.test.ts', 'utf8');

const tests = `
  it('allows valid orders with fabric lines', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [
      { sku: 'FAB1', description: 'T', quantity: 1, unit: 'Y2' }
    ];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(true);
  });

  it('fails if there are no final fabric lines but order requires fabric', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('MISSING_FINAL_FABRIC_LINES');
  });

  it('fails if fabric SKU is empty', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [
      { sku: '  ', description: 'T', quantity: 1, unit: 'Y2' }
    ];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('EMPTY_FABRIC_SKU');
  });

  it('fails if fabric quantity is <= 0', () => {
    const order = getBaseOrder();
    order.items[0].result = { selectedFabric: { itemCode: 'FAB1' } } as any;
    order.productionReview!.finalFabricLines = [
      { sku: 'FAB1', description: 'T', quantity: 0, unit: 'Y2' }
    ];
    const result = validateOrderBeforeSage(order);
    expect(result.ok).toBe(false);
    expect(result.errors.map(e => e.code)).toContain('INVALID_FABRIC_QUANTITY');
  });
`;

c = c.replace(
  "});",
  tests + "\n});"
);

fs.writeFileSync('src/domain/orders/__tests__/validateOrderBeforeSage.test.ts', c);
