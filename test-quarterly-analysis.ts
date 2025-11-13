// 测试新的季度分析分块逻辑
import { analyzeQuarterWithMindTrace, splitEntriesByMonth } from './lib/aiAnalysis.js';

const testEntries = [
  {
    id: 1,
    date: new Date('2024-01-15'),
    content: '今天是一个美好的一天，工作进展顺利，心情很愉快。学习了新的技术，感觉很有成就感。',
    subtitle: '1月15日的美好时光'
  },
  {
    id: 2,
    date: new Date('2024-01-28'),
    content: '本月总结：工作充实，生活丰富。学到了很多新东西，结识了新朋友。',
    subtitle: '1月总结'
  },
  {
    id: 3,
    date: new Date('2024-02-10'),
    content: '今天有点焦虑，工作压力比较大。需要学会更好地管理时间，减少压力。',
    subtitle: '压力管理'
  },
  {
    id: 4,
    date: new Date('2024-02-25'),
    content: '本月感悟：开始学习冥想，确实有帮助。情绪管理能力有所提升。',
    subtitle: '2月的成长'
  },
  {
    id: 5,
    date: new Date('2024-03-05'),
    content: '春天到了，感觉整个人都充满了活力。计划参加更多户外活动。',
    subtitle: '春天的活力'
  },
  {
    id: 6,
    date: new Date('2024-03-20'),
    content: '季度总结：这个季度经历了情绪的起伏，但总体上在成长。学会了更好的情绪管理技巧。',
    subtitle: '第一季度总结'
  }
];

console.log('=== 测试季度分析分块逻辑 ===');
console.log(`测试数据：${testEntries.length}篇日记，涵盖2024年第一季度`);

// 测试按月分割功能
console.log('\n1. 测试按月分割功能：');
const monthlyGroups = splitEntriesByMonth(testEntries);
Object.entries(monthlyGroups).forEach(([month, entries]) => {
  console.log(`  ${month}: ${entries.length}篇日记`);
});

// 测试完整分析功能
console.log('\n2. 测试季度分析功能：');
analyzeQuarterWithMindTrace(testEntries)
  .then(result => {
    console.log('分析结果：');
    console.log('  整体印象:', result.overallImpression);
    console.log('  主要主题:', result.themes.map(t => `${t.name}(${t.weight})`).join(', '));
    console.log('  子报告数量:', result.subReports.length);
    
    result.subReports.forEach((subReport, index) => {
      console.log(`  子报告 ${index + 1} (${subReport.month}):`);
      console.log(`    整体印象: ${subReport.overallImpression.substring(0, 50)}...`);
      console.log(`    主要主题: ${subReport.themes.map(t => t.name).join(', ')}`);
      console.log(`    关键洞察: ${subReport.keyInsights.join('; ')}`);
    });
  })
  .catch(error => {
    console.error('分析失败:', error);
  });