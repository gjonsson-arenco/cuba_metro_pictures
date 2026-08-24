import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { validatePassword } from '@metro/shared';
import { useAuth } from '../lib/AuthContext';

const INPUT =
  'w-full border border-cuba-navy/15 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cuba-navy focus:border-cuba-navy';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-1.5';

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const check = validatePassword(next);
    if (!check.valid) {
      setError(check.error ?? 'Contraseña inválida');
      return;
    }
    if (next !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (next === current) {
      setError('La nueva contraseña tiene que ser distinta de la actual');
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
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
          <div className="mb-6">
            <h1 className="section-title text-2xl">Cambiar contraseña</h1>
            <p className="section-subtitle text-sm">{user.username}</p>
            <span className="section-rule mt-3" />
          </div>

          {done ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                Listo, tu contraseña quedó actualizada.
              </div>
              <button onClick={() => navigate('/')} className="btn-primary w-full text-center">
                Volver a la galería
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={LABEL}>Contraseña actual</label>
                <input
                  type="password"
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  required
                  autoFocus
                  className={INPUT}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className={LABEL}>Nueva contraseña</label>
                <input
                  type="password"
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  required
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
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
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

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="btn-secondary flex-1 text-center"
                >
                  Cancelar
                </button>
                <button type="submit" disabled={isLoading} className="btn-primary flex-1 text-center">
                  {isLoading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
