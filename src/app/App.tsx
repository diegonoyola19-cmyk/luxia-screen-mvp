import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { LoginScreen } from '../components/LoginScreen';
import { ScreenCalculatorPage } from '../features/calculadora-screen/ScreenCalculatorPage';
import { LuxiaIcon } from '../components/LuxiaIcon';
import { supabase } from '../lib/supabase';
import { logAppActivity } from '../lib/logAppActivity';

export function App() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initialize();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Evitar duplicados por re-renders o StrictMode
        const loggedInFlag = sessionStorage.getItem(`logged_in_${session.user.id}`);
        if (!loggedInFlag) {
          sessionStorage.setItem(`logged_in_${session.user.id}`, 'true');
          logAppActivity({
            event_type: 'user.login',
            entity_type: 'user',
            entity_id: session.user.id,
            metadata: { source: 'auth_state_change' }
          });
        }
      } else if (event === 'SIGNED_OUT') {
        sessionStorage.clear();
      }
    });

    return () => {
      unsubscribe();
      authListener.subscription.unsubscribe();
    };
  }, [initialize]);

  if (loading) {
    return (
      <div className="splash-screen">
        <div className="splash-logo-wrapper">
          <LuxiaIcon width={72} height={72} />
        </div>
        <h2 className="splash-brand-text">LUXIA</h2>
        <div className="splash-spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <ScreenCalculatorPage />;
}

