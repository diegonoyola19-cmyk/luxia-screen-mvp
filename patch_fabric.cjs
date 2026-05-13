const fs = require('fs');
let c = fs.readFileSync('src/domain/orders/materialReview.ts', 'utf8');

const func = `
export function generateFinalFabricLines(adjustments: ProductionFabricAdjustment[]): SageMaterialLine[] {
  const aggregated = new Map<string, SageMaterialLine>();

  const addOrUpdate = (sku: string, desc: string, qtyY2: number) => {
    const key = sku + '_Y2';
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += qtyY2;
    } else {
      aggregated.set(key, {
        sku,
        description: desc,
        quantity: qtyY2,
        unit: 'Y2'
      });
    }
  };

  for (const adj of adjustments) {
    if (adj.action === 'removed') {
      continue;
    }

    let sku = '';
    let desc = '';
    let areaY2 = 0;

    if (adj.action === 'confirmed') {
      sku = adj.calculatedFabricSku || '';
      desc = adj.calculatedFabricDescription || sku;
      
      if (adj.calculatedConsumptionYd !== undefined && adj.calculatedWidthM !== undefined) {
         // Si tiene consumo en Yd lineal, no es Y2.
         // En el requerimiento dice "Si el sistema tiene area en m2 convertir a Y2. Si solo tiene lineal calcular area."
         // Usemos los datos crudos
         const heightM = adj.calculatedHeightM || 0;
         const widthM = adj.calculatedWidthM || 0;
         const areaM2 = widthM * heightM;
         areaY2 = areaM2 * 1.19599;
      }
      
      // Intentamos usar "actualAreaY2" si ya se rellenó desde el modal de todos modos al confirmar
      if (adj.actualAreaY2 && adj.actualAreaY2 > 0) {
        areaY2 = adj.actualAreaY2;
      } else if (adj.calculatedWidthM && adj.calculatedHeightM) {
         areaY2 = (adj.calculatedWidthM * adj.calculatedHeightM) * 1.19599;
      }

    } else {
      sku = adj.actualFabricSku || adj.calculatedFabricSku || '';
      desc = adj.actualFabricDescription || adj.calculatedFabricDescription || sku;
      areaY2 = adj.actualAreaY2 || 0;
    }

    if (sku && areaY2 > 0) {
      addOrUpdate(sku, desc, areaY2);
    }
  }

  // Round quantities to 4 decimal places for Sage
  const result = Array.from(aggregated.values());
  result.forEach(r => {
    r.quantity = Number(r.quantity.toFixed(4));
  });

  return result;
}
`;

fs.writeFileSync('src/domain/orders/materialReview.ts', c + '\n' + func);
