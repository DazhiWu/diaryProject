import { useState, useEffect } from 'react';

type AuthStatus = 'guest' | 'authenticated';

interface AuthHook {
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  authenticateUser: (password: string) => boolean;
  logout: () => void;
}

// 简单的密码验证（实际应用中应该使用更安全的方式）
const AUTH_PASSWORD = process.env.NEXT_PUBLIC_AUTH_PASSWORD;

export const useAuth = (): AuthHook => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('guest');

  // 在组件挂载时检查本地存储的认证状态
  useEffect(() => {
    const storedAuthStatus = localStorage.getItem('diaryAppAuthStatus');
    if (storedAuthStatus === 'authenticated') {
      setAuthStatus('authenticated');
    }
  }, []);

  // 验证用户密码
  const authenticateUser = (password: string): boolean => {
    if (password === AUTH_PASSWORD) {
      setAuthStatus('authenticated');
      localStorage.setItem('diaryAppAuthStatus', 'authenticated');
      return true;
    }
    return false;
  };

  // 登出用户
  const logout = () => {
    setAuthStatus('guest');
    localStorage.removeItem('diaryAppAuthStatus');
  };

  return {
    authStatus,
    isAuthenticated: authStatus === 'authenticated',
    authenticateUser,
    logout
  };
};