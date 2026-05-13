import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalculatorStore } from './store/useCalculatorStore';
import { LuxiaIcon } from '../../components/LuxiaIcon';

const ProductionModuleV2 = lazy(async () => {
  const module = await import('./components/ProductionModuleV2');
  return { default: module.ProductionModuleV2 };
});

const InventoryPanelV2 = lazy(async () => {
  const module = await import('./components/InventoryPanelV2');
  return { default: module.InventoryPanelV2 };
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
  const theme = useCalculatorStore((state) => state.theme);
  const setTheme = useCalculatorStore((state) => state.setTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <main className="page-shell">
      <section className="page-frame">
        <div className="view-switcher">
          <div style={{ display: 'flex', alignItems: 'center', marginRight: '40px', gap: '12px', flexShrink: 0 }}>
            <LuxiaIcon width={46} height={46} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>LUXIA</span>
              <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.01em', color: 'var(--text-muted, #6E6E73)', marginTop: '2px' }}>Powered by Vertilux</span>
            </div>
          </div>
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'production-v2' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'production-v2'}
            onClick={() => setActiveView('production-v2')}
          >
            Producción
          </button>
          {/* V3 Lab oculto — motor integrado en Producción
          <button
            type="button"
            className={[
              'view-switcher__tab',
              activeView === 'v3-lab' ? 'view-switcher__tab--active' : '',
            ].join(' ')}
            aria-pressed={activeView === 'v3-lab'}
            onClick={() => setActiveView('v3-lab')}
          >
            V3 (Lab)
          </button>
          */}
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
          <button
            type="button"
            className="view-switcher__tab"
            style={{ marginLeft: 'auto', flex: 'none' }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <div className={`page-content${activeView === 'production-v2' ? ' page-content--fullwidth' : ''}`}>
          <AnimatePresence mode="wait">
            {activeView === 'production-v2' && (
              <motion.div
                key="production-v2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="view-content"
              >
                <DeferredPanel>
                  <ProductionModuleV2 />
                </DeferredPanel>
              </motion.div>
            )}



            {activeView === 'inventory' && (
              <motion.div
                key="inventory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="view-content"
              >
                <DeferredPanel>
                  <InventoryPanelV2 />
                </DeferredPanel>
              </motion.div>
            )}

            {activeView === 'orders' && (
              <motion.div
                key="orders"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="view-content"
              >
                <DeferredPanel>
                  <SavedOrdersPanel />
                </DeferredPanel>
              </motion.div>
            )}

            {activeView === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="view-content"
              >
                <DeferredPanel>
                  <section className="content-grid content-grid--rules">
                    <RulesPanel />
                  </section>
                </DeferredPanel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}

