import { useState, useEffect, useCallback } from 'react';

type AuthLevel = 'guest' | 'viewer' | 'admin';

interface AuthHook {
  authLevel: AuthLevel;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isViewer: boolean;
  isLoading: boolean;
  authenticateUser: (password: string) => Promise<boolean>;
}

export const useAuth = (): AuthHook => {
  const [authLevel, setAuthLevel] = useState<AuthLevel>('guest');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    localStorage.removeItem('diaryAppAuthLevel');
    localStorage.removeItem('diaryAppAuthStatus');

    void fetch('/api/auth/session')
      .then(async (response) => response.ok ? response.json() : { role: 'guest' })
      .then((data: { role?: AuthLevel }) => {
        if (active) setAuthLevel(data.role === 'viewer' || data.role === 'admin' ? data.role : 'guest');
      })
      .catch(() => {
        if (active) setAuthLevel('guest');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, []);

  const authenticateUser = useCallback(async (password: string): Promise<boolean> => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    if (data.role === 'admin' || data.role === 'viewer') {
      setAuthLevel(data.role);
      return true;
    }
    return false;
  }, []);

  return {
    authLevel,
    isAuthenticated: authLevel !== 'guest',
    isAdmin: authLevel === 'admin',
    isViewer: authLevel === 'viewer',
    isLoading,
    authenticateUser,
  };
};
