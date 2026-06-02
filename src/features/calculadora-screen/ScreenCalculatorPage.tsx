import { Suspense, lazy, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalculatorStore } from './store/useCalculatorStore';
import { LuxiaIcon } from '../../components/LuxiaIcon';
import { useAuthStore } from '../../store/useAuthStore';
import { PermissionGate } from '../../components/PermissionGate';
import { useOrderSync } from '../../hooks/useOrderSync';

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

const VIEW_PERMISSIONS = {
  'production-v2': 'production.view',
  inventory: 'inventory.view',
  orders: 'orders.view',
  settings: 'settings.view',
  users: 'users.view',
} as const;

type ProtectedView = keyof typeof VIEW_PERMISSIONS;

const NAV_ITEMS: Array<{ view: ProtectedView; label: string }> = [
  { view: 'production-v2', label: 'Producción' },
  { view: 'inventory', label: 'Bodega' },
  { view: 'orders', label: 'Ordenes' },
  { view: 'settings', label: 'Configuracion' },
  { view: 'users', label: 'Usuarios' },
];

export function ScreenCalculatorPage() {
  const activeView = useCalculatorStore((state) => state.activeView);
  const setActiveView = useCalculatorStore((state) => state.setActiveView);
  const theme = useCalculatorStore((state) => state.theme);
  const setTheme = useCalculatorStore((state) => state.setTheme);

  useOrderSync();

  const { user, role, signOut, hasPermission, permissions } = useAuthStore();
  const allowedTabs = useMemo(
    () => NAV_ITEMS.filter((item) => hasPermission(VIEW_PERMISSIONS[item.view])).map((item) => item.view),
    [hasPermission, permissions, role]
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Redirection guard: if current view is not allowed for the user's role, auto-redirect to first allowed
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeView as ProtectedView)) {
      setActiveView(allowedTabs[0]);
    }
  }, [allowedTabs, activeView, setActiveView]);

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

          {NAV_ITEMS.filter((item) => allowedTabs.includes(item.view)).map((item) => (
            <button
              key={item.view}
              type="button"
              className={[
                'view-switcher__tab',
                activeView === item.view ? 'view-switcher__tab--active' : '',
              ].join(' ')}
              aria-pressed={activeView === item.view}
              onClick={() => setActiveView(item.view)}
            >
              {item.label}
            </button>
          ))}

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
          {allowedTabs.length === 0 ? (
            <section className="content-grid">
              <div className="card">
                <span className="section-heading__eyebrow">Acceso restringido</span>
                <h2>Sin permisos asignados</h2>
                <p className="rules-panel__copy">
                  Tu usuario no tiene vistas disponibles. Contacta al administrador para revisar tus permisos.
                </p>
              </div>
            </section>
          ) : (
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
                <PermissionGate permission={VIEW_PERMISSIONS['production-v2']}>
                  <DeferredPanel>
                    <ProductionModuleV2 />
                  </DeferredPanel>
                </PermissionGate>
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
                <PermissionGate permission={VIEW_PERMISSIONS.inventory}>
                  <DeferredPanel>
                    <InventoryPanelV2 />
                  </DeferredPanel>
                </PermissionGate>
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
                <PermissionGate permission={VIEW_PERMISSIONS.orders}>
                  <DeferredPanel>
                    <SavedOrdersPanel />
                  </DeferredPanel>
                </PermissionGate>
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
                <PermissionGate permission={VIEW_PERMISSIONS.settings}>
                  <DeferredPanel>
                    <section className="content-grid content-grid--rules">
                      <RulesPanel />
                    </section>
                  </DeferredPanel>
                </PermissionGate>
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
                <PermissionGate permission={VIEW_PERMISSIONS.users}>
                  <DeferredPanel>
                    <UsersPanel />
                  </DeferredPanel>
                </PermissionGate>
              </motion.div>
            )}
          </AnimatePresence>
          )}
        </div>
      </section>
    </main>
  );
}


