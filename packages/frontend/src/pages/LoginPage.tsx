import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (user) {
    navigate('/admin');
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      navigate('/admin');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="card p-8">
          <div className="text-center mb-8">
            <img src="/metro-logo.svg" alt="Metropolitano CUBA 2026" className="mx-auto h-24 w-auto text-cuba-navy" />
            <h1 className="section-title mt-4">Panel de Administración</h1>
            <p className="section-subtitle text-sm">Campeonato Metropolitano — CUBA 2026</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-1.5">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full border border-cuba-navy/15 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cuba-navy focus:border-cuba-navy"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-cuba-navy/15 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cuba-navy focus:border-cuba-navy"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full text-center"
            >
              {isLoading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
