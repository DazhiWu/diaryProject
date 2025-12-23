import { useState, useEffect, useCallback } from 'react';

type AuthLevel = 'guest' | 'viewer' | 'admin';

interface AuthHook {
  authLevel: AuthLevel;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isViewer: boolean;
  authenticateUser: (password: string) => boolean;
  logout: () => void;
}

// 简单的密码验证（实际应用中应该使用更安全的方式）
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_AUTH_PASSWORD_ADMIN;
const VIEWER_PASSWORD = process.env.NEXT_PUBLIC_AUTH_PASSWORD_VIEWER;

export const useAuth = (): AuthHook => {
  // 在初始化时使用默认值'guest'，然后在useEffect中从localStorage获取实际状态
  // 这样可以避免SSR环境中localStorage不存在的问题
  const [authLevel, setAuthLevel] = useState<AuthLevel>('guest');

  // 初始检查和localStorage监听
  useEffect(() => {
    // 只在浏览器环境中执行，避免SSR错误
    if (typeof window !== 'undefined') {
      const checkAuthStatus = () => {
        const storedAuthLevel = localStorage.getItem('diaryAppAuthLevel');
        setAuthLevel((storedAuthLevel as AuthLevel) || 'guest');
      };

      // 初始检查，确保组件能获取到正确的认证状态
      checkAuthStatus();

      // 监听localStorage变化，以处理跨标签页和组件的认证状态更新
      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === 'diaryAppAuthLevel') {
          checkAuthStatus();
        }
      };

      // 添加事件监听器
      window.addEventListener('storage', handleStorageChange);

      // 清理函数
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, []);

  // 验证用户密码
  const authenticateUser = useCallback((password: string): boolean => {
    if (password === ADMIN_PASSWORD) {
      // 直接更新状态，确保当前组件能立即响应
      setAuthLevel('admin');
      // 更新localStorage，触发其他组件的状态更新
      localStorage.setItem('diaryAppAuthLevel', 'admin');
      localStorage.setItem('diaryAppAuthStatus', 'authenticated');
      return true;
    } else if (password === VIEWER_PASSWORD) {
      // 直接更新状态，确保当前组件能立即响应
      setAuthLevel('viewer');
      // 更新localStorage，触发其他组件的状态更新
      localStorage.setItem('diaryAppAuthLevel', 'viewer');
      localStorage.setItem('diaryAppAuthStatus', 'authenticated');
      return true;
    }
    return false;
  }, []);

  // 登出用户
  const logout = useCallback(() => {
    // 直接更新状态，确保当前组件能立即响应
    setAuthLevel('guest');
    // 更新localStorage，触发其他组件的状态更新
    localStorage.removeItem('diaryAppAuthLevel');
    localStorage.removeItem('diaryAppAuthStatus');
  }, []);

  return {
    authLevel,
    isAuthenticated: authLevel !== 'guest',
    isAdmin: authLevel === 'admin',
    isViewer: authLevel === 'viewer',
    authenticateUser,
    logout
  };
};