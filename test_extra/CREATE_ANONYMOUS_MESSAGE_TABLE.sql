-- 创建匿名留言板数据表
-- 用于存储所有用户的匿名留言

CREATE TABLE IF NOT EXISTS anonymous_messages (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_anonymous_messages_created_at ON anonymous_messages(created_at DESC);

-- 启用行级安全性（RLS）
ALTER TABLE anonymous_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE anonymous_messages FROM anon, authenticated;
GRANT SELECT (id, content, created_at) ON TABLE anonymous_messages TO anon;

-- 创建策略：匿名访客只能读取公开展示列
CREATE POLICY "Allow anon read access"
  ON anonymous_messages 
  FOR SELECT
  TO anon
  USING (true);

-- INSERT 通过应用的同源限流 API 使用 service-role 执行；anon 不可直写。
