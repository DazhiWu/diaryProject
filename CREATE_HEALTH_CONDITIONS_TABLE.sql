-- 在 Supabase SQL Editor 中运行此脚本以创建 health_conditions 表

CREATE TABLE IF NOT EXISTS health_conditions (
  id TEXT PRIMARY KEY,
  condition TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用行级安全性（RLS）- 可选，根据需要调整
ALTER TABLE health_conditions ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许所有认证用户读取（根据需求调整）
CREATE POLICY "Allow authenticated read access"
  ON health_conditions
  FOR SELECT
  USING (true);

-- 创建策略：仅允许管理员用户写入（根据需求调整）
-- 注意：你需要根据实际的认证系统调整此策略
CREATE POLICY "Allow admin write access"
  ON health_conditions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 如果需要，也可以完全禁用 RLS 进行测试：
-- ALTER TABLE health_conditions DISABLE ROW LEVEL SECURITY;
