const fs = require('fs');
let c = fs.readFileSync('src/domain/orders/validateOrderBeforeSage.ts', 'utf8');

c = c.replace(
  `  // Validar líneas finales
  const placeholderRegex = /^X+$/i;
  for (const line of finalLines) {
    if (!line.sku || line.sku.trim() === "") {
      addError("EMPTY_SKU", \`Material sin SKU definido: \${line.description}\`);
    } else if (placeholderRegex.test(line.sku.trim())) {
      addError("UNRESOLVED_SKU_PLACEHOLDER", \`El SKU \${line.sku} contiene un placeholder sin resolver en: \${line.description}\`);
    }
  }`,
  `  // Validar líneas finales
  const placeholderRegex = /^X+$/i;
  for (const line of finalLines) {
    if (!line.sku || line.sku.trim() === "") {
      addError("EMPTY_SKU", \`Material sin SKU definido: \${line.description}\`);
    } else if (placeholderRegex.test(line.sku.trim())) {
      addError("UNRESOLVED_SKU_PLACEHOLDER", \`El SKU \${line.sku} contiene un placeholder sin resolver en: \${line.description}\`);
    }
  }

  // Validar Telas
  const hasFabric = order.items.some(i => i.result?.selectedFabric);
  if (hasFabric) {
    const finalFabricLines = order.productionReview.finalFabricLines || [];
    if (finalFabricLines.length === 0) {
      addError("MISSING_FINAL_FABRIC_LINES", "La orden no contiene telas para enviar a Sage, aunque requiere tela.");
    }
    for (const line of finalFabricLines) {
      if (!line.sku || line.sku.trim() === "") {
        addError("EMPTY_FABRIC_SKU", \`Tela sin SKU definido: \${line.description}\`);
      } else if (placeholderRegex.test(line.sku.trim())) {
        addError("UNRESOLVED_FABRIC_SKU_PLACEHOLDER", \`El SKU de tela \${line.sku} contiene un placeholder sin resolver en: \${line.description}\`);
      }
      if (line.quantity <= 0) {
        addError("INVALID_FABRIC_QUANTITY", \`La cantidad de tela exportada para \${line.sku} es <= 0.\`);
      }
    }
    
    // Check if any adjustment couldn't resolve area
    const fabricAdjs = order.productionReview.fabricAdjustments || [];
    for (const adj of fabricAdjs) {
      if (adj.action !== 'removed') {
         if ((adj.actualAreaY2 === undefined || adj.actualAreaY2 <= 0) && (adj.calculatedWidthM === undefined || adj.calculatedHeightM === undefined) && adj.action === 'confirmed') {
            // Could not calculate Y2
            // Actually let's just rely on finalFabricLines length or quantity.
         }
      }
    }
  }`
);

fs.writeFileSync('src/domain/orders/validateOrderBeforeSage.ts', c);
