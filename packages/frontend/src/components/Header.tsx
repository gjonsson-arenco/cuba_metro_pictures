import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { USER_ROLE_LABELS } from '@metro/shared';

export default function Header() {
  const { user, role, canManagePhotos, canManageUsers, logout } = useAuth();

  return (
    <header className="bg-cuba-navy text-white shadow-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <img
              src="/metro-logo.svg"
              alt="Metropolitano CUBA 2026"
              className="h-14 w-auto text-white"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-serif text-lg font-bold tracking-wide">Metropolitano</span>
              <span className="text-[11px] uppercase tracking-[0.25em] text-white/70">CUBA · 2026</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/"
              className="px-3 py-1.5 rounded-md text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
            >
              Galería
            </Link>
            {canManagePhotos && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-md text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
              >
                Fotos
              </Link>
            )}
            {canManageUsers && (
              <Link
                to="/admin/users"
                className="px-3 py-1.5 rounded-md text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
              >
                Usuarios
              </Link>
            )}
            {user ? (
              <div className="flex items-center gap-3 pl-3 ml-1 border-l border-white/15">
                <Link
                  to="/cambiar-password"
                  title="Cambiar contraseña"
                  className="hidden sm:flex flex-col items-end leading-tight hover:opacity-80 transition-opacity"
                >
                  <span className="text-xs tracking-wide text-white/70 normal-case">{user.email}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                    {USER_ROLE_LABELS[role]}
                  </span>
                </Link>
                <button
                  onClick={() => logout()}
                  className="text-sm bg-white text-cuba-navy px-3 py-1.5 rounded-md font-semibold hover:bg-cuba-cream transition-colors"
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm bg-white text-cuba-navy px-4 py-1.5 rounded-md font-semibold hover:bg-cuba-cream transition-colors"
              >
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      </div>
      <div className="h-0.5 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </header>
  );
}
