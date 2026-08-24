import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ReactNode } from 'react';

/** Which permission the wrapped route needs. Defaults to photo management. */
type Requires = 'photos' | 'users';

export default function ProtectedRoute({
  children,
  requires = 'photos'
}: {
  children: ReactNode;
  requires?: Requires;
}) {
  const { user, isLoading, canManagePhotos, canManageUsers } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-cuba-navy border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const allowed = requires === 'users' ? canManageUsers : canManagePhotos;
  // Logged in but lacking the permission: send them to the gallery, not to a
  // login screen they already passed.
  if (!allowed) return <Navigate to="/" replace />;

  return <>{children}</>;
}
