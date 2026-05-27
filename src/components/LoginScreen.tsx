import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { LuxiaIcon } from './LuxiaIcon';
import { toast } from 'sonner';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!email.trim() || !password.trim()) {
      toast.error('Por favor, ingresa tu correo y contraseña.');
      return;
    }

    const result = await signIn(email.trim(), password);
    if (result.success) {
      toast.success('¡Sesión iniciada con éxito!');
    } else {
      toast.error(result.error || 'Error al iniciar sesión. Intenta nuevamente.');
    }
  };

  return (
    <div className="login-container">
      {/* Background ambient glows */}
      <div className="login-glow login-glow--1" />
      <div className="login-glow login-glow--2" />

      <div className="login-card-wrapper">
        <div className="login-card">
          <header className="login-header">
            <div className="login-logo-circle">
              <LuxiaIcon width={58} height={58} />
            </div>
            <div className="login-brand-meta">
              <h1 className="login-title">LUXIA</h1>
              <span className="login-subtitle">Sistema de Control de Producción</span>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-alert-error" role="alert">
                <span className="login-alert-icon">⚠️</span>
                <p className="login-alert-text">{error}</p>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="email">Correo Electrónico</label>
              <div className="login-input-wrapper">
                <span className="login-input-icon">✉️</span>
                <input
                  id="email"
                  type="email"
                  placeholder="nombre@luxia.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) clearError();
                  }}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">Contraseña</label>
              <div className="login-input-wrapper">
                <span className="login-input-icon">🔒</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) clearError();
                  }}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-button"
              disabled={loading}
            >
              {loading ? (
                <div className="login-spinner-wrapper">
                  <span className="login-spinner"></span>
                  <span>Iniciando sesión...</span>
                </div>
              ) : (
                'Ingresar al Sistema'
              )}
            </button>
          </form>

          <footer className="login-footer">
            <span className="login-footer-badge">VERSIÓN DE PRODUCCIÓN</span>
            <p className="login-footer-note">
              Acceso restringido únicamente a personal autorizado de Vertilux. 
              Las cuentas son gestionadas por el administrador de TI.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
