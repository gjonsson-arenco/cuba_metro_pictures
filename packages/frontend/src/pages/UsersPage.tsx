import { useState, useEffect, FormEvent, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ManagedUser,
  UserRole,
  USER_ROLES,
  USER_ROLE_LABELS,
  USER_ROLE_DESCRIPTIONS,
  AppSettings,
  isValidEmail
} from '@metro/shared';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  getSettings,
  updateSettings
} from '../lib/api';
import { useAuth } from '../lib/AuthContext';

interface Credential {
  email: string;
  password: string;
  isNew: boolean;
}

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-cuba-navy text-white',
  editor: 'bg-cuba-navy/15 text-cuba-navy',
  viewer: 'bg-white border border-cuba-navy/20 text-cuba-navy/70'
};

function errorMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string } } })?.response;
  return res?.data?.message ?? (err instanceof Error ? err.message : fallback);
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');
  const [isCreating, setIsCreating] = useState(false);

  const [credential, setCredential] = useState<Credential | null>(null);
  const [copied, setCopied] = useState(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { users } = await listUsers();
      setUsers(users);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar los usuarios'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    getSettings()
      .then(({ settings }) => setSettings(settings))
      .catch(err => setError(errorMessage(err, 'No se pudieron cargar las opciones del sitio')));
  }, []);

  async function handlePublicDownloads(publicDownloads: boolean) {
    setSavingSetting(true);
    setError('');
    // Optimistic: the switch is the only thing on screen that reflects it, and
    // a failed save puts the old value straight back.
    const previous = settings;
    setSettings(prev => (prev ? { ...prev, publicDownloads } : prev));
    try {
      const { settings: saved } = await updateSettings({ publicDownloads });
      setSettings(saved);
    } catch (err) {
      setSettings(previous);
      setError(errorMessage(err, 'No se pudo guardar la opción'));
    } finally {
      setSavingSetting(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setError('Email inválido');
      return;
    }
    setIsCreating(true);
    setError('');
    try {
      const { user, temporaryPassword } = await createUser({ email, role: newRole });
      setCredential({ email: user.email, password: temporaryPassword, isNew: true });
      setCopied(false);
      setNewEmail('');
      setNewRole('editor');
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el usuario'));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRoleChange(u: ManagedUser, role: UserRole) {
    if (role === u.role) return;
    setBusy(u.username);
    setError('');
    try {
      await updateUser(u.username, { role });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el rol'));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleEnabled(u: ManagedUser) {
    setBusy(u.username);
    setError('');
    try {
      await updateUser(u.username, { enabled: !u.enabled });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el estado'));
    } finally {
      setBusy(null);
    }
  }

  async function handleReset(u: ManagedUser) {
    if (!confirm(`¿Generar una contraseña nueva para ${u.email}?`)) return;
    setBusy(u.username);
    setError('');
    try {
      const { password } = await resetUserPassword(u.username);
      setCredential({ email: u.email, password, isNew: false });
      setCopied(false);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo resetear la contraseña'));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(u: ManagedUser) {
    if (!confirm(`¿Borrar a ${u.email}? Esta acción no se puede deshacer.`)) return;
    setBusy(u.username);
    setError('');
    try {
      await deleteUser(u.username);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar el usuario'));
    } finally {
      setBusy(null);
    }
  }

  async function copyCredential() {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(`${credential.email} / ${credential.password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="section-title">Usuarios</h1>
          <p className="section-subtitle">Altas, roles y acceso al panel</p>
          <span className="section-rule mt-3" />
        </div>
        <Link to="/admin" className="btn-secondary">
          ← Volver a fotos
        </Link>
      </div>

      {/* Credencial recién generada */}
      {credential && (
        <div className="card p-5 mb-6 border-l-4 border-l-cuba-navy">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-bold text-cuba-navy">
                {credential.isNew ? 'Usuario creado' : 'Contraseña nueva'}
              </h2>
              <p className="text-sm text-cuba-navy/70 mt-1">
                Copiala ahora y pasásela a la persona: no se puede volver a ver. Es de{' '}
                <strong>un solo uso</strong> — al entrar, elige su propia contraseña.
              </p>
              <div className="mt-3 font-mono text-sm bg-cuba-cream rounded-lg px-3 py-2 break-all">
                <div>{credential.email}</div>
                <div className="font-bold">{credential.password}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={copyCredential} className="btn-primary text-sm py-1.5 px-3">
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
              <button
                onClick={() => setCredential(null)}
                className="btn-secondary text-sm py-1.5 px-3"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opciones del sitio */}
      <div className="card p-6 mb-8">
        <h2 className="font-serif text-xl font-bold text-cuba-navy mb-4">Descargas</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.publicDownloads ?? false}
            disabled={settings === null || savingSetting}
            onChange={e => handlePublicDownloads(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-cuba-navy/25 text-cuba-navy focus:ring-cuba-navy disabled:opacity-40"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-cuba-navy">
              Permitir descargas sin iniciar sesión
            </span>
            <span className="block text-xs text-cuba-navy/60 mt-1">
              {settings === null
                ? 'Cargando…'
                : settings.publicDownloads
                  ? 'Cualquier visitante puede bajar las fotos en calidad original.'
                  : 'Sólo usuarios con sesión iniciada pueden bajar las fotos. Los visitantes ven la galería y el botón los manda a ingresar.'}
            </span>
          </span>
        </label>
      </div>

      {/* Alta */}
      <div className="card p-6 mb-8">
        <h2 className="font-serif text-xl font-bold text-cuba-navy mb-4">Nuevo usuario</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              required
              placeholder="persona@ejemplo.com"
              className="w-full border border-cuba-navy/15 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cuba-navy focus:border-cuba-navy"
            />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-1.5">
              Rol
            </label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as UserRole)}
              className="w-full border border-cuba-navy/15 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cuba-navy focus:border-cuba-navy"
            >
              {USER_ROLES.map(r => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={isCreating} className="btn-primary">
            {isCreating ? 'Creando...' : 'Crear'}
          </button>
        </form>
        <p className="text-xs text-cuba-navy/60 mt-3">
          {USER_ROLE_LABELS[newRole]}: {USER_ROLE_DESCRIPTIONS[newRole]}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {/* Listado */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cuba-navy border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-12 text-center text-cuba-navy/60">No hay usuarios.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cuba-cream/60 border-b border-cuba-navy/10">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold text-cuba-navy">Email</th>
                  <th className="px-4 py-3 font-semibold text-cuba-navy">Rol</th>
                  <th className="px-4 py-3 font-semibold text-cuba-navy">Estado</th>
                  <th className="px-4 py-3 font-semibold text-cuba-navy text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = currentUser?.username === u.username;
                  const isBusy = busy === u.username;
                  return (
                    <tr
                      key={u.username}
                      className={`border-b border-cuba-navy/5 last:border-0 ${
                        u.enabled ? '' : 'opacity-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-cuba-navy">{u.email}</span>
                        {isSelf && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-cuba-navy/50">
                            vos
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isBusy || isSelf}
                          onChange={e => handleRoleChange(u, e.target.value as UserRole)}
                          className={`text-xs font-semibold rounded-full px-3 py-1 ${ROLE_BADGE[u.role]} disabled:cursor-not-allowed`}
                        >
                          {USER_ROLES.map(r => (
                            <option key={r} value={r} className="bg-white text-cuba-navy">
                              {USER_ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-cuba-navy/70">
                        {!u.enabled
                          ? 'Deshabilitado'
                          : u.status === 'FORCE_CHANGE_PASSWORD'
                            ? 'Pendiente de 1er ingreso'
                            : 'Activo'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end flex-wrap">
                          <button
                            onClick={() => handleReset(u)}
                            disabled={isBusy}
                            className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40"
                          >
                            Resetear pass
                          </button>
                          <button
                            onClick={() => handleToggleEnabled(u)}
                            disabled={isBusy || isSelf}
                            className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {u.enabled ? 'Deshabilitar' : 'Habilitar'}
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={isBusy || isSelf}
                            className="btn-danger text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-cuba-navy/60 mt-4 space-y-1">
        <p>
          Las contraseñas que genera el sistema son de un solo uso: la persona elige la suya al
          entrar por primera vez, y después puede cambiarla desde su nombre en el encabezado.
        </p>
        <p>
          Los cambios de rol tardan hasta 60 minutos en aplicarse: el usuario los ve recién cuando
          su token vence. Para cortar el acceso ya, deshabilitalo.
        </p>
      </div>
    </main>
  );
}
