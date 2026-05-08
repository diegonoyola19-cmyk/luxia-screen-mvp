const fs = require('fs');
const path = require('path');

const allFiles = [
  'src/app/App.tsx',
  'src/components/ui/Button.tsx',
  'src/components/ui/Card.tsx',
  'src/domain/curtains/constants.ts',
  'src/domain/curtains/CuttingGroup.ts',
  'src/domain/curtains/cuttingOptimizer.ts',
  'src/domain/curtains/screen.test.ts',
  'src/domain/curtains/screen.ts',
  'src/domain/curtains/types.ts',
  'src/features/calculadora-screen/components/InventoryPanelV2.css',
  'src/features/calculadora-screen/components/InventoryPanelV2.tsx',
  'src/features/calculadora-screen/components/ProduccionV3.tsx',
  'src/features/calculadora-screen/components/ProductionModuleV2.css',
  'src/features/calculadora-screen/components/ProductionModuleV2.tsx',
  'src/features/calculadora-screen/components/RulesPanel.tsx',
  'src/features/calculadora-screen/components/SavedOrdersPanel.tsx',
  'src/features/calculadora-screen/hooks/useCalculatorDerivedState.ts',
  'src/features/calculadora-screen/store/slices/calculationSlice.ts',
  'src/features/calculadora-screen/store/slices/inventorySlice.ts',
  'src/features/calculadora-screen/store/slices/orderSlice.ts',
  'src/features/calculadora-screen/store/slices/rulesSlice.ts',
  'src/features/calculadora-screen/store/slices/uiSlice.ts',
  'src/features/calculadora-screen/store/slices/wasteSlice.ts',
  'src/features/calculadora-screen/store/types.ts',
  'src/features/calculadora-screen/store/useCalculatorStore.ts',
  'src/features/calculadora-screen/ScreenCalculatorPage.tsx',
  'src/features/calculadora-screen/utils.ts',
  'src/lib/csvExport.ts',
  'src/lib/format.ts',
  'src/lib/inventory.ts',
  'src/lib/itemCatalog.ts',
  'src/lib/orderTransfer.ts',
  'src/lib/priceCatalog.ts',
  'src/lib/production.ts',
  'src/lib/recipeResolver.ts',
  'src/lib/sageExport.ts',
  'src/lib/storage.ts',
  'src/lib/supabase.ts',
  'src/lib/supabaseRepository.ts',
  'src/logic/generateRollerBOM.ts',
  'src/logic/rollerEngineV3.ts',
  'src/logic/rollerResolver.ts',
  'src/styles/global.css',
  'src/styles/inventory.css',
  'src/styles/orders.css',
  'src/styles/production.css',
  'src/styles/rules.css',
  'src/ErrorBoundary.tsx',
  'src/main.tsx',
  'src/setupTests.ts',
  'src/vite-env.d.ts',
];

const importedSet = new Set([
  'src/main.tsx',
  'src/vite-env.d.ts',
  'src/setupTests.ts',
]);

const EXTS = ['', '.ts', '.tsx', '.css', '/index.ts', '/index.tsx'];

allFiles.forEach(f => {
  let content;
  try { content = fs.readFileSync(f, 'utf8'); } catch { return; }

  const dir = path.dirname(f).replace(/\\/g, '/');
  const re = /(?:from|import|require)\s*\(?['"](\.[^'"]+)['"]\)?/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rel = m[1];
    const base = path.posix.normalize(dir + '/' + rel);
    for (const ext of EXTS) {
      const candidate = base + ext;
      if (allFiles.includes(candidate)) {
        importedSet.add(candidate);
        break;
      }
    }
  }
});

const orphans = allFiles.filter(f => !importedSet.has(f));

console.log('\n=== REFERENCIADOS (' + importedSet.size + ') ===');
[...importedSet].sort().forEach(f => console.log('  OK  ' + f));

console.log('\n=== POSIBLES HUERFANOS (' + orphans.length + ') ===');
orphans.forEach(f => console.log('  ??  ' + f));
