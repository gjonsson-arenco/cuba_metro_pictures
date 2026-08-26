import { useEffect, useState, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { USER_ROLE_LABELS } from '@metro/shared';

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

export default function Header() {
  const { user, role, canManagePhotos, canManageUsers, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links: { to: string; label: string }[] = [
    { to: '/', label: 'Galería' },
    ...(canManagePhotos ? [{ to: '/admin', label: 'Fotos' }] : []),
    ...(canManageUsers ? [{ to: '/admin/users', label: 'Usuarios' }] : [])
  ];

  return (
    <header
      // `sticky` ya sirve de ancla para el panel absoluto; sumarle `relative`
      // sería pisarle el position.
      className="bg-cuba-navy text-white shadow-md sticky top-0 z-30"
      // El fondo navy se estira por debajo del status bar y el contenido baja:
      // el reloj queda sobre azul, no sobre el encabezado.
      style={{ paddingTop: 'var(--safe-top)' }}
    >
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

          {/* Escritorio: todo a la vista */}
          <nav className="hidden sm:flex items-center gap-1 sm:gap-3">
            {links.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className="px-3 py-1.5 rounded-md text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 transition-colors"
              >
                {l.label}
              </Link>
            ))}
            {user ? (
              <div className="flex items-center gap-3 pl-3 ml-1 border-l border-white/15">
                <Link
                  to="/cambiar-password"
                  title="Cambiar contraseña"
                  className="flex flex-col items-end leading-tight hover:opacity-80 transition-opacity"
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

          {/* Teléfono: todo detrás de la hamburguesa */}
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            className="sm:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-md text-white/90 hover:bg-white/10 transition-colors"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open && (
        <>
          {/* Un toque afuera cierra. Va antes que el panel para quedar debajo. */}
          <div
            className="fixed inset-0 sm:hidden"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <nav
            id="menu-mobile"
            className="sm:hidden absolute top-full inset-x-0 bg-cuba-navy shadow-xl border-t border-white/10"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            {links.map(l => (
              <MenuItem key={l.to} to={l.to} onNavigate={() => setOpen(false)}>
                {l.label}
              </MenuItem>
            ))}

            <div className="border-t border-white/10 mt-1 pt-1">
              {user ? (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <div className="text-sm text-white/80 break-all">{user.email}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 mt-0.5">
                      {USER_ROLE_LABELS[role]}
                    </div>
                  </div>
                  <MenuItem to="/cambiar-password" onNavigate={() => setOpen(false)}>
                    Cambiar contraseña
                  </MenuItem>
                  <button
                    onClick={() => { setOpen(false); void logout(); }}
                    className="w-full text-left px-4 py-3 text-base font-semibold text-white/90 hover:bg-white/10 transition-colors"
                  >
                    Salir
                  </button>
                </>
              ) : (
                <MenuItem to="/login" onNavigate={() => setOpen(false)}>
                  Ingresar
                </MenuItem>
              )}
            </div>
          </nav>
        </>
      )}

      <div className="h-0.5 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </header>
  );
}

function MenuItem({ to, onNavigate, children }: { to: string; onNavigate: () => void; children: ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="block px-4 py-3 text-base font-semibold text-white/90 hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
