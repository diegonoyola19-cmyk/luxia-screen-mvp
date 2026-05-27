import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalculatorStore } from './store/useCalculatorStore';
import { LuxiaIcon } from '../../components/LuxiaIcon';
import { useAuthStore } from '../../store/useAuthStore';

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
const UsersPanel = lazy(async () => {
  const module = await import('./components/UsersPanel');
  return { default: module.UsersPanel };
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

const ALLOWED_TABS_BY_ROLE: Record<string, string[]> = {
  admin: ['production-v2', 'inventory', 'orders', 'settings', 'users'],
  produccion: ['production-v2', 'orders'],
  bodega: ['inventory'],
  consulta: ['production-v2', 'inventory', 'orders'],
};

export function ScreenCalculatorPage() {
  const activeView = useCalculatorStore((state) => state.activeView);
  const setActiveView = useCalculatorStore((state) => state.setActiveView);
  const theme = useCalculatorStore((state) => state.theme);
  const setTheme = useCalculatorStore((state) => state.setTheme);

  const { user, role, signOut } = useAuthStore();
  const allowedTabs = ALLOWED_TABS_BY_ROLE[role || 'consulta'] || [];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Redirection guard: if current view is not allowed for the user's role, auto-redirect to first allowed
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeView)) {
      setActiveView(allowedTabs[0] as any);
    }
  }, [role, allowedTabs, activeView, setActiveView]);

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

          {allowedTabs.includes('production-v2') && (
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
          )}

          {allowedTabs.includes('inventory') && (
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
          )}

          {allowedTabs.includes('orders') && (
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
          )}

          {allowedTabs.includes('settings') && (
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
          )}

          {allowedTabs.includes('users') && (
            <button
              type="button"
              className={[
                'view-switcher__tab',
                activeView === 'users' ? 'view-switcher__tab--active' : '',
              ].join(' ')}
              aria-pressed={activeView === 'users'}
              onClick={() => setActiveView('users')}
            >
              Usuarios
            </button>
          )}

          {/* User profile info & buttons aligned to the right */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            {user && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', marginRight: '6px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                  {user.email}
                </span>
                <span style={{ 
                  fontSize: '0.62rem', 
                  fontWeight: 800, 
                  letterSpacing: '0.06em', 
                  textTransform: 'uppercase', 
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--primary-glow)',
                  color: 'var(--primary)'
                }}>
                  {role || 'consulta'}
                </span>
              </div>
            )}

            <button
              type="button"
              className="view-switcher__tab"
              style={{ flex: 'none', height: 'auto', padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: '999px', fontSize: '0.78rem', color: 'var(--muted-strong)' }}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            <button
              type="button"
              className="view-switcher__tab"
              style={{ flex: 'none', height: 'auto', padding: '6px 14px', background: 'rgba(192, 37, 58, 0.1)', border: '1px solid rgba(192, 37, 58, 0.2)', borderRadius: '999px', fontSize: '0.78rem', color: '#ffb4ab', fontWeight: 700 }}
              onClick={() => signOut()}
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>

        <div className={`page-content${activeView === 'production-v2' ? ' page-content--fullwidth' : ''}`}>
          <AnimatePresence mode="wait">
            {activeView === 'production-v2' && allowedTabs.includes('production-v2') && (
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

            {activeView === 'inventory' && allowedTabs.includes('inventory') && (
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

            {activeView === 'orders' && allowedTabs.includes('orders') && (
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

            {activeView === 'settings' && allowedTabs.includes('settings') && (
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

            {activeView === 'users' && allowedTabs.includes('users') && (
              <motion.div
                key="users"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="view-content"
              >
                <DeferredPanel>
                  <UsersPanel />
                </DeferredPanel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}


