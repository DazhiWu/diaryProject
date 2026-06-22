"use client"

import { useState } from 'react'

export default function Loading() {
  const [particles] = useState(() =>
    Array.from({ length: 10 }, () => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDuration: `${3 + Math.random() * 2}s`,
      animationDelay: `${Math.random() * 2}s`,
    }))
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="relative">
        {/* 主加载动画 */}
        <div className="flex items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
          <div className="text-primary/80 font-medium">
            <div className="text-lg">加载中</div>
            <div className="text-sm text-primary/60 mt-1">正在准备你的日记...</div>
          </div>
        </div>
        {/* 装饰性粒子效果 */}
        <div className="absolute inset-0 overflow-hidden rounded-full -z-10">
          {particles.map((particle, i) => (
            <div
              key={i}
              className="absolute h-2 w-2 rounded-full bg-primary/30"
              style={{
                left: particle.left,
                top: particle.top,
                animation: `float ${particle.animationDuration} ease-in-out infinite ${particle.animationDelay}`,
              }}
            />
          ))}
        </div>
      </div>
      <style jsx global>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translateY(-20px) scale(1.2);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  )
}
