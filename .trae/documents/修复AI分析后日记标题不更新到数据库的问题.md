1. 修改 `diary-detail.tsx` 中的 `handleAIAnalysis` 函数
2. 在调用 `onUpdateEntry` 之后，添加调用 `updateDiaryEntry` 函数的代码
3. 确保 `updateDiaryEntry` 函数只更新 `subtitle` 字段，而不影响其他字段
4. 测试修改后的功能，确保AI分析后日记标题能正确更新到数据库

修改思路：
- 目前 `handleAIAnalysis` 函数只更新了本地状态，没有更新数据库
- 需要在函数中添加对 `updateDiaryEntry` 的调用，将AI生成的标题保存到 `diaryContent` 表
- 确保调用顺序正确：先保存AI分析结果，再更新日记标题，最后更新本地状态

具体修改位置：
- 文件：`d:\software\cursor_trae\diaryProject\components\diary-detail.tsx`
- 函数：`handleAIAnalysis`
- 在现有代码中添加 `updateDiaryEntry` 调用