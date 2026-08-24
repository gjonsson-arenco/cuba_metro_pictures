import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ReactNode } from 'react';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-cuba-navy border-t-transparent" />
      </div>
    );
  }

  if (!user || !isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
