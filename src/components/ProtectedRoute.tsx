import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

// Authenticated users pass through. Guests pass through if they've acknowledged the login page.
// Everyone else is redirected to /login.
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !currentUser && !sessionStorage.getItem('guestMode')) {
      navigate('/login', { replace: true });
    }
  }, [loading, currentUser, navigate]);

  if (loading) return null;
  return <>{children}</>;
}