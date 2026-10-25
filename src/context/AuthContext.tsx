import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const ALLOWED_DOMAIN = '@yaqbot.com';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(ALLOWED_DOMAIN));
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (isAuthorizedEmail(currentUser.email)) {
          setUser(currentUser);
          setError(null);
        } else {
          await firebaseSignOut(auth);
          setUser(null);
          setError(
            `Access restricted: "${currentUser.email}" is not authorized. Only ${ALLOWED_DOMAIN} accounts are allowed.`
          );
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<boolean> => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const signedInUser = result.user;

      if (!isAuthorizedEmail(signedInUser.email)) {
        await firebaseSignOut(auth);
        setUser(null);
        setError(
          `Access restricted: "${signedInUser.email}" is not authorized. Only ${ALLOWED_DOMAIN} accounts can access Coach Setup.`
        );
        return false;
      }

      setUser(signedInUser);
      return true;
    } catch (err: unknown) {
      console.error('Firebase Authentication Error during Google Sign-In:', err);
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred during Google Sign-In.';
      setError(message);
      return false;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (err: unknown) {
      console.error('Firebase Sign-Out Error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

