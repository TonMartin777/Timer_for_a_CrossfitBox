import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, isAuthorizedEmail } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm tracking-wide uppercase">Verifying coach session...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAuthorizedEmail(user.email)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

