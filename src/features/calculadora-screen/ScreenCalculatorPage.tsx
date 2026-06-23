import { Suspense, lazy, useEffect, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalculatorStore } from './store/useCalculatorStore';
import { LuxiaIcon } from '../../components/LuxiaIcon';
import { useAuthStore } from '../../store/useAuthStore';
import { PermissionGate } from '../../components/PermissionGate';
import { useOrderSync } from '../../hooks/useOrderSync';
import { useInventorySync } from '../../hooks/useInventorySync';

function GlobalSyncIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const syncMetadata = useCalculatorStore(s => s.syncMetadata);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const pendingCount = Object.values(syncMetadata || {}).filter(m => m.status === 'pending').length;
  const errorCount = Object.values(syncMetadata || {}).filter(m => m.status === 'error').length;

  if (!isOnline) {
    return (
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', 
        fontWeight: 600, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', 
        padding: '4px 8px', borderRadius: '4px',
        transition: 'all var(--transition-normal) var(--ease-out-quint)',
        animation: 'pulse-slow 2s infinite ease-in-out'
      }}>
        <span>🔴</span> Trabajando offline {pendingCount > 0 ? `(${pendingCount} pend.)` : ''}
      </div>
    );
  }

  if (errorCount > 0) {
    const errorMsg = Object.values(syncMetadata || {}).find(m => m.status === 'error')?.errorMessage || 'Error de sincronización';
    return (
      <div 
        title={errorMsg}
        style={{ 
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', 
        fontWeight: 600, color: 'var(--color-danger)', background: 'var(--color-danger-soft)', 
        padding: '4px 8px', borderRadius: '4px',
        transition: 'all var(--transition-normal) var(--ease-out-quint)',
        animation: 'pulse-slow 2s infinite ease-in-out'
      }}>
        <span>⚠️</span> Error de sincronización
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', 
        fontWeight: 600, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', 
        padding: '4px 8px', borderRadius: '4px',
        transition: 'all var(--transition-normal) var(--ease-out-quint)'
      }}>
        <span>⏳</span> {pendingCount} pend.
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', 
      fontWeight: 600, color: '#10b981', opacity: 0.7,
      transition: 'all var(--transition-normal) var(--ease-out-quint)'
    }} title="Sincronizado">
      ☁️
    </div>
  );
}

function UserMenuDropdown({ user, role, theme, setTheme, signOut }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!user) return null;

  const initial = user.email ? user.email.charAt(0).toUpperCase() : 'U';

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-glow)',
          color: 'var(--primary)', fontWeight: 800, fontSize: '1rem', display: 'flex', 
          alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(192, 37, 58, 0.2)',
          cursor: 'pointer',
          transition: 'transform var(--transition-fast) var(--ease-out-quint), box-shadow var(--transition-fast) var(--ease-out-quint)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        aria-label="Menú de usuario"
      >
        {initial}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.175, 0.885, 0.32, 1.275] }}
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '260px',
              background: 'var(--surface)', border: '1px solid var(--line-strong)',
              borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', padding: '12px',
              display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 100
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span 
                style={{ 
                  fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', 
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                }}
                title={user.email}
              >
                {user.email}
              </span>
              <span style={{ 
                fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', 
                padding: '2px 6px', borderRadius: '4px', background: 'var(--primary-glow)', 
                color: 'var(--primary)', width: 'fit-content' 
              }}>
                {role || 'consulta'}
              </span>
            </div>

            <div style={{ height: '1px', background: 'var(--line)' }} />

            <button
              type="button"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'transparent', border: '1px solid var(--line-strong)',
                borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer'
              }}
              onClick={() => {
                setTheme(theme === 'dark' ? 'light' : 'dark');
                setIsOpen(false);
              }}
            >
              <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>

            <button
              type="button"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 12px', background: 'var(--color-danger-soft)', border: 'none',
                borderRadius: '6px', fontSize: '0.8rem', color: 'var(--color-danger)', fontWeight: 700, cursor: 'pointer',
                transition: 'background var(--transition-fast) var(--ease-out-quint), transform var(--transition-fast) var(--ease-out-quint)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-danger-border)'}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-danger-soft)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
              onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              onClick={() => {
                signOut();
                setIsOpen(false);
              }}
            >
              Cerrar sesión
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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

const NAV_ITEMS: Array<{ view: ProtectedView; label: string; icon: string }> = [
  { view: 'production-v2', label: 'Producción', icon: '🏭' },
  { view: 'inventory', label: 'Bodega', icon: '📦' },
  { view: 'orders', label: 'Ordenes', icon: '📋' },
  { view: 'settings', label: 'Configuracion', icon: '⚙️' },
  { view: 'users', label: 'Usuarios', icon: '👥' },
];

export function ScreenCalculatorPage() {
  const activeView = useCalculatorStore((state) => state.activeView);
  const setActiveView = useCalculatorStore((state) => state.setActiveView);
  const theme = useCalculatorStore((state) => state.theme);
  const setTheme = useCalculatorStore((state) => state.setTheme);

  const [isPinned, setIsPinned] = useState(() => localStorage.getItem('luxia:sidebar:pinned') === 'true');
  const [forceCollapsed, setForceCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useOrderSync();
  
  // Phase 5B.6: Mount global inventory sync. This will load global items on startup.
  useInventorySync();

  const { user, role, signOut, hasPermission, permissions } = useAuthStore();
  const allowedTabs = useMemo(
    () => NAV_ITEMS.filter((item) => hasPermission(VIEW_PERMISSIONS[item.view])).map((item) => item.view),
    [hasPermission, permissions, role]
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('luxia:sidebar:pinned', String(isPinned));
  }, [isPinned]);

  // Redirection guard: if current view is not allowed for the user's role, auto-redirect to first allowed
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeView as ProtectedView)) {
      setActiveView(allowedTabs[0]);
    }
  }, [allowedTabs, activeView, setActiveView]);

  const activeTabLabel = NAV_ITEMS.find(i => i.view === activeView)?.label || '';

  return (
    <div className="app-layout">
      {isMobile && isMobileDrawerOpen && (
        <div 
          className="app-drawer-overlay" 
          onClick={() => setIsMobileDrawerOpen(false)} 
        />
      )}

      <aside 
        onMouseLeave={() => setForceCollapsed(false)}
        className={isMobile 
          ? `app-drawer ${isMobileDrawerOpen ? 'app-drawer--open' : ''}` 
          : `app-sidebar ${isPinned ? 'app-sidebar--pinned' : ''} ${forceCollapsed ? 'app-sidebar--force-collapsed' : ''}`
        }
      >
        <div className="app-sidebar__inner">
          <div className="app-sidebar__header">
            <LuxiaIcon width={32} height={32} />
            <div className="app-sidebar__header-text">
              <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>LUXIA</span>
              <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.01em', color: 'var(--text-muted, #6E6E73)', marginTop: '2px' }}>Powered by Vertilux</span>
            </div>
          </div>

          <nav className="app-sidebar__nav">
            {NAV_ITEMS.filter((item) => allowedTabs.includes(item.view)).map((item) => (
              <button
                key={item.view}
                type="button"
                className={`app-sidebar__link ${activeView === item.view ? 'app-sidebar__link--active' : ''}`}
                aria-label={item.label}
                onClick={() => {
                  setActiveView(item.view);
                  setIsMobileDrawerOpen(false);
                }}
              >
                <div className="app-sidebar__icon" aria-hidden="true">{item.icon}</div>
                <span className="app-sidebar__text">{item.label}</span>
              </button>
            ))}
          </nav>

          {!isMobile && (
            <button 
              className="app-sidebar__toggle" 
              onClick={() => {
                if (isPinned) {
                  setIsPinned(false);
                  setForceCollapsed(true);
                } else {
                  setIsPinned(true);
                  setForceCollapsed(false);
                }
              }}
              title={isPinned ? "Colapsar menú" : "Fijar menú expandido"}
            >
              <span className="app-sidebar__toggle-icon">»</span>
            </button>
          )}
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <button 
            className="mobile-menu-btn" 
            onClick={() => setIsMobileDrawerOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          
          <h1 className="app-header__title">{activeTabLabel}</h1>

          <div className="app-header__actions">
            <GlobalSyncIndicator />
            <UserMenuDropdown 
              user={user} 
              role={role} 
              theme={theme} 
              setTheme={setTheme} 
              signOut={signOut} 
            />
          </div>
        </header>

        <div className={`page-content${['production-v2', 'orders', 'inventory', 'users'].includes(activeView as string) ? ' page-content--fullwidth' : ''}`}>
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
      </main>
    </div>
  );
}


