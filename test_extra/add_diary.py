import re
from datetime import datetime, timedelta
from playwright.sync_api import Playwright, sync_playwright, expect

def run(playwright: Playwright) -> None:
    # 1. 动态获取今天的日期（格式为 2026-07-05）
    yesterday_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # 2. 从外部 txt 文件中读取多行日记内容
    # encoding="utf-8" 确保中文不会乱码；f.read() 会连同换行符一起完整读取
    try:
        with open("diary.txt", "r", encoding="utf-8") as f:
            lines = f.readlines()  # 按行读取，得到一个列表
            
        # 过滤并处理文本：
        # lines[3:] 表示跳过前三行（索引 0、1、2），从第四行（索引 3）开始读取
        processed_lines = []
        for line in lines[3:]:
            # strip() 先去掉每行末尾自带的换行符和首尾空格
            # 如果这一行不是空行，就在前面加四个空格并补上换行符
            if line.strip(): 
                processed_lines.append("    " + line.strip() + "\n")
            else:
                # 如果是空行，保持空行即可，不加空格
                processed_lines.append("\n")
        
        # 将处理后的行列表重新拼接成一个完整的字符串
        user_thought = "".join(processed_lines)
    except FileNotFoundError:
        print("❌ 错误：找不到 diary.txt 文件，请先创建它！")
        return
    if not user_thought.strip():
        print("❌ 错误：diary.txt 文件不能为空！请输入日记内容。")
        return

    browser = playwright.chromium.launch(headless=False, slow_mo=500) # 加上 slow_mo 方便肉眼观察
    context = browser.new_context()
    page = context.new_page()
    
    page.goto("https://diary.wuzhizhii.com/")
    page.get_by_role("button", name="用户认证").click()
    page.get_by_role("textbox", name="请输入认证密码").fill("zhizhiriji_20251106")
    page.get_by_role("button", name="认证").click()
    
    page.get_by_role("button", name="写日记").click()
    
    # 3. 使用你刚才输入的自定义内容
    page.get_by_role("textbox", name="Write your thoughts...").click()
    page.get_by_role("textbox", name="Write your thoughts...").fill(user_thought)
    
    # 4. 自动填写今天的日期（不再写死）
    page.locator("input[type=\"date\"]").fill(yesterday_date)
    
    page.get_by_role("button", name="Save Entry").click()
    
    # === 针对问题 2 的动态优化 ===
    print("正在等待保存成功并返回首页...")
    # 5. 等待“写日记”按钮再次出现，确保页面已经成功退回首页
    page.get_by_role("button", name="写日记").wait_for(state="visible")
    
    # 6. 动态点击最新生成的卡片
    print("正在定位今日新生成的卡片...")
    # 💡 备用策略 B（如果策略 A 报错找不到，请把上一行删掉，取消下面这行的注释）：
    # 完美点击：第一张卡片里面那个负责点击的子区块
    page.locator('div[data-slot="card"]').first.locator('div[class*="cursor-pointer"]').click()
    
    # 7. 点击 AI 分析
    page.get_by_role("button", name="AI分析").click()
    print("🎉 成功点击AI分析！")

    # 留出 5 秒看一眼 AI 分析的结果
    page.wait_for_timeout(5000)
    
    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)