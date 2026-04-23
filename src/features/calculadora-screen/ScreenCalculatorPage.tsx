import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalculatorStore } from './store/useCalculatorStore';
import { ProductionModule } from './components/ProductionModule';
import {
  saveFormDraft,
  saveInventoryMovements,
  saveProductionInventory,
  saveProjectDraft,
  saveSavedOrders,
  saveScreenRuleConfig,
} from '../../lib/storage';

const InventoryPanel = lazy(async () => {
  const module = await import('./components/InventoryPanel');
  return { default: module.InventoryPanel };
});
const RulesPanel = lazy(async () => {
  const module = await import('./components/RulesPanel');
  return { default: module.RulesPanel };
});
const SavedOrdersPanel = lazy(async () => {
  const module = await import('./components/SavedOrdersPanel');
  return { default: module.SavedOrdersPanel };
});

function DeferredPanel({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <section className="content-grid">
          <div className="card">
            <span className="section-heading__eyebrow">Cargando</span>
            <h2>Preparando modulo</h2>
            <p className="rules-panel__copy">
              Esta vista se carga bajo demanda para que Produccion abra mas rapido.
            </p>
          </div>
        </section>
      }
    >
      {children}
    </Suspense>
  );
}

export function ScreenCalculatorPage() {
  const activeView = useCalculatorStore((state) => state.activeView);
  const setActiveView = useCalculatorStore((state) => state.setActiveView);

  // Storage sync subscriptions
  const formValues = useCalculatorStore((state) => state.formValues);
  const orderDraft = useCalculatorStore((state) => state.orderDraft);
  const savedOrders = useCalculatorStore((state) => state.savedOrders);
  const productionInventory = useCalculatorStore((state) => state.productionInventory);
  const inventoryMovements = useCalculatorStore((state) => state.inventoryMovements);
  const ruleConfig = useCalculatorStore((state) => state.ruleConfig);

  useEffect(() => { saveFormDraft(formValues); }, [formValues]);
  useEffect(() => { saveProjectDraft(orderDraft); }, [orderDraft]);
  useEffect(() => { saveSavedOrders(savedOrders); }, [savedOrders]);
  useEffect(() => { saveProductionInventory(productionInventory); }, [productionInventory]);
  useEffect(() => { saveInventoryMovements(inventoryMovements); }, [inventoryMovements]);
  useEffect(() => { saveScreenRuleConfig(ruleConfig); }, [ruleConfig]);

  return (
    <main className="page-shell">
      <section className="page-frame">
        <div className="view-switcher">
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'production' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'production'}
            onClick={() => setActiveView('production')}
          >
            Produccion
          </button>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'inventory' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'inventory'}
            onClick={() => setActiveView('inventory')}
          >
            Bodega
          </button>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'orders' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'orders'}
            onClick={() => setActiveView('orders')}
          >
            Ordenes
          </button>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'settings' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
          >
            Configuracion
          </button>
        </div>

        <div className="page-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {activeView === 'production' ? (
                <ProductionModule />
              ) : activeView === 'inventory' ? (
                <DeferredPanel>
                  <InventoryPanel />
                </DeferredPanel>
              ) : activeView === 'orders' ? (
                <DeferredPanel>
                  <SavedOrdersPanel />
                </DeferredPanel>
              ) : (
                <DeferredPanel>
                  <section className="content-grid content-grid--rules">
                    <RulesPanel />
                  </section>
                </DeferredPanel>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
