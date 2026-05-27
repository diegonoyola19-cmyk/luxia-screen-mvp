import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { LoginScreen } from '../components/LoginScreen';
import { ScreenCalculatorPage } from '../features/calculadora-screen/ScreenCalculatorPage';
import { LuxiaIcon } from '../components/LuxiaIcon';

export function App() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initialize();
    return () => {
      unsubscribe();
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

