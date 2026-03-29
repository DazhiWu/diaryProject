-- 创建匿名留言板数据表
-- 用于存储所有用户的匿名留言

CREATE TABLE IF NOT EXISTS anonymous_messages (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_anonymous_messages_created_at ON anonymous_messages(created_at DESC);

-- 启用行级安全性（RLS）
ALTER TABLE anonymous_messages ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许所有人读取留言
CREATE POLICY "Allow public read access" 
  ON anonymous_messages 
  FOR SELECT 
  USING (true);

-- 创建策略：允许所有人插入留言
CREATE POLICY "Allow public insert access" 
  ON anonymous_messages 
  FOR INSERT 
  WITH CHECK (true);

-- 注意：出于隐私和安全考虑，不允许删除或更新留言
-- 只有数据库管理员可以通过Supabase控制台直接管理数据
