import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken, clearToken, getToken } from '../services/api';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
}

interface AuthContextType {
  currentUser: AuthUser | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, validate any stored token and restore the session
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    api.get<{ id: string; email: string; display_name?: string }>('/auth/me')
      .then(user => {
        setCurrentUser({ id: user.id, email: user.email, displayName: user.display_name });
      })
      .catch(() => {
        clearToken(); // Token invalid or expired — force re-login
      })
      .finally(() => setLoading(false));
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { user, token } = await api.post<{
      user: { id: string; email: string; displayName?: string };
      token: string;
    }>('/auth/login', { email, password });
    setToken(token);
    setCurrentUser({ id: user.id, email: user.email, displayName: user.displayName });
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { user, token } = await api.post<{
      user: { id: string; email: string; displayName?: string };
      token: string;
    }>('/auth/register', { email, password });
    setToken(token);
    setCurrentUser({ id: user.id, email: user.email, displayName: user.displayName });
  };

  const logout = async () => {
    clearToken();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, signInWithEmail, signUpWithEmail, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
