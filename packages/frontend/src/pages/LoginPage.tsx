import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { validatePassword } from '@metro/shared';
import { useAuth } from '../lib/AuthContext';

const INPUT =
  'w-full border border-cuba-navy/15 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cuba-navy focus:border-cuba-navy';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-1.5';

export default function LoginPage() {
  const { login, completeNewPassword, user } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Second phase: Cognito demands a replacement for the one-use credential.
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (user) {
    navigate('/');
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await login(username, password);
      if (result === 'new-password') {
        setNeedsNewPassword(true);
      } else {
        navigate('/');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleNewPassword(e: FormEvent) {
    e.preventDefault();
    setError('');

    const check = validatePassword(newPassword);
    if (!check.valid) {
      setError(check.error ?? 'Contraseña inválida');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (newPassword === password) {
      setError('Elegí una contraseña distinta de la que te dieron');
      return;
    }

    setIsLoading(true);
    try {
      await completeNewPassword(newPassword);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="card p-8">
          <div className="text-center mb-8">
            <img
              src="/metro-logo.svg"
              alt="Metropolitano CUBA 2026"
              className="mx-auto h-24 w-auto text-cuba-navy"
            />
            <h1 className="section-title mt-4">
              {needsNewPassword ? 'Elegí tu contraseña' : 'Panel de Administración'}
            </h1>
            <p className="section-subtitle text-sm">
              {needsNewPassword
                ? 'La que te dieron era de un solo uso'
                : 'Campeonato Metropolitano — CUBA 2026'}
            </p>
          </div>

          {needsNewPassword ? (
            <form onSubmit={handleNewPassword} className="space-y-4">
              <div>
                <label className={LABEL}>Nueva contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  className={INPUT}
                  placeholder="••••••••"
                />
                <p className="text-xs text-cuba-navy/60 mt-1.5">
                  Mínimo 8 caracteres, con una mayúscula, una minúscula y un número.
                </p>
              </div>
              <div>
                <label className={LABEL}>Repetila</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className={INPUT}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={isLoading} className="btn-primary w-full text-center">
                {isLoading ? 'Guardando...' : 'Guardar y entrar'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={LABEL}>Usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className={INPUT}
                  placeholder="tu@email.com"
                />
              </div>
              <div>
                <label className={LABEL}>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className={INPUT}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={isLoading} className="btn-primary w-full text-center">
                {isLoading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
