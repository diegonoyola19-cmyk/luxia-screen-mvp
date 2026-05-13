const fs = require('fs');
let c = fs.readFileSync('src/domain/orders/__tests__/materialReview.test.ts', 'utf8');

const tests = `
import { generateFinalFabricLines, ProductionFabricAdjustment } from '../materialReview';

describe('generateFinalFabricLines', () => {
  it('converts calculated width/height to Y2 for confirmed action', () => {
    const adjustments: ProductionFabricAdjustment[] = [
      {
        id: '1', curtainId: 'c1',
        action: 'confirmed',
        calculatedFabricSku: 'FAB1',
        calculatedWidthM: 2,
        calculatedHeightM: 1.5,
      }
    ];

    const result = generateFinalFabricLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('FAB1');
    expect(result[0].unit).toBe('Y2');
    
    // 2 * 1.5 = 3 m2 -> 3 * 1.19599 = 3.58797 -> 3.588
    expect(result[0].quantity).toBe(3.588);
  });

  it('uses actualAreaY2 if provided', () => {
    const adjustments: ProductionFabricAdjustment[] = [
      {
        id: '1', curtainId: 'c1',
        action: 'consumption_adjusted',
        actualFabricSku: 'FAB1',
        actualAreaY2: 5.5,
      }
    ];

    const result = generateFinalFabricLines(adjustments);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5.5);
  });

  it('ignores removed items', () => {
    const adjustments: ProductionFabricAdjustment[] = [
      {
        id: '1', curtainId: 'c1',
        action: 'removed',
        calculatedFabricSku: 'FAB1'
      }
    ];

    const result = generateFinalFabricLines(adjustments);
    expect(result).toHaveLength(0);
  });
});
`;

c = c.replace(
  "import { generateFinalMaterialLines, ProductionMaterialAdjustment } from '../materialReview';",
  "import { generateFinalMaterialLines, ProductionMaterialAdjustment, generateFinalFabricLines, ProductionFabricAdjustment } from '../materialReview';"
);

fs.writeFileSync('src/domain/orders/__tests__/materialReview.test.ts', c + '\n' + tests.replace("import { generateFinalFabricLines, ProductionFabricAdjustment } from '../materialReview';", ""));
