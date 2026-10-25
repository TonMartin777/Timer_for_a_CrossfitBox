import React, { useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { Timer, ShieldAlert, LogIn, Monitor } from 'lucide-react';
import { useAuth, isAuthorizedEmail } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { user, loading, error, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const navigate = useNavigate();

  if (!loading && user && isAuthorizedEmail(user.email)) {
    return <Navigate to="/setup" replace />;
  }

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    const success = await signInWithGoogle();
    setSigningIn(false);
    if (success) {
      navigate('/setup', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 bg-yellow-400/10 border border-yellow-400/30 rounded-2xl flex items-center justify-center mb-4">
            <Timer className="w-8 h-8 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Yaqbot CrossFit Timer
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Coach Control Panel — Sign in with your <span className="text-yellow-400 font-mono">@yaqbot.com</span> account
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex items-start gap-3"
          >
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={signingIn || loading}
          className="w-full py-3.5 px-4 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold rounded-xl transition flex items-center justify-center gap-3 cursor-pointer"
        >
          <LogIn className="w-5 h-5" />
          {signingIn ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
          <Link
            to="/timer"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-yellow-400 transition"
          >
            <Monitor className="w-4 h-4" />
            Open Public Floor Timer Display (/timer)
          </Link>
        </div>
      </div>
    </div>
  );
};

