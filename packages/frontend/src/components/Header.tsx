import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function Header() {
  const { user, isAdmin, logout } = useAuth();

  return (
    <header className="bg-cuba-blue text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <span className="text-2xl font-bold tracking-tight">⛵ Campeonato Metropolitano</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/" className="hover:text-blue-200 transition-colors text-sm font-medium">
              Galería
            </Link>
            {isAdmin && (
              <Link to="/admin" className="hover:text-blue-200 transition-colors text-sm font-medium">
                Admin
              </Link>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-200">{user.username}</span>
                <button
                  onClick={() => logout()}
                  className="text-sm bg-white text-cuba-blue px-3 py-1 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm bg-white text-cuba-blue px-3 py-1 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
