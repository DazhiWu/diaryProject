"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const { authenticateUser, isAdmin } = auth;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (authenticateUser(password)) {
      toast.success('认证成功！页面将自动刷新以应用权限设置。');
      onOpenChange(false);
      setPassword('');
      // 认证成功后主动刷新页面，确保所有组件都能获取到最新的认证状态
      setTimeout(() => {
        window.location.reload();
      }, 500); // 给toast显示留一点时间
    } else {
      toast.error('密码错误，请重试。');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>用户认证</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              认证成功后可以看之前的所有日记，真感兴趣可以去个人主页的联系方式里找我
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入认证信息"
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit">认证</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}