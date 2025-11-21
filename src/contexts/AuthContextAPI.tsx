import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiService, setAuthToken, getAuthToken } from '../services/apiService';

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing auth token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const user = await apiService.getCurrentUser();
          setCurrentUser({
            uid: user.id,
            email: user.email,
            displayName: user.display_name || null,
            photoURL: null,
          });
        } catch (error) {
          // Token invalid or expired
          setAuthToken(null);
          setCurrentUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const signInWithGoogle = async () => {
    throw new Error('Google sign-in not implemented in API mode. Use email/password.');
  };

  const signInWithEmail = async (email: string, password: string) => {
    const user = await apiService.login(email, password);
    setCurrentUser({
      uid: user.id,
      email: user.email,
      displayName: user.displayName || null,
      photoURL: null,
    });
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const user = await apiService.register(email, password);
    setCurrentUser({
      uid: user.id,
      email: user.email,
      displayName: user.displayName || null,
      photoURL: null,
    });
  };

  const logout = async () => {
    await apiService.logout();
    setCurrentUser(null);
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
