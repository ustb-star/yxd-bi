export interface KPIData {
  label: string;
  value: string | number;
  unit?: string;
  trend: 'up' | 'down' | 'neutral';
  percentage: string;
  description: string;
}

export interface ChartDataPoint {
  name: string;
  [key: string]: string | number;
}

export const MOCK_KPI_DATA: KPIData[] = [
  { label: '总工单数', value: '12,840', trend: 'up', percentage: '12.5%', description: '较上周期' },
  { label: '平均处理时长', value: '4.2', unit: 'min', trend: 'down', percentage: '8.3%', description: '较上周期' },
  { label: '识别准确率', value: '98.2', unit: '%', trend: 'up', percentage: '2.1%', description: '较上周期' },
  { label: '总人力成本', value: '¥45.2k', trend: 'up', percentage: '5.4%', description: '较上周期' },
];

export const CONVERSION_FUNNEL_DATA = [
  { name: '来源输入', value: 15000, fill: '#8884d8' },
  { name: '成功创建工单', value: 14200, fill: '#83a6ed' },
  { name: '转工作单', value: 13800, fill: '#8dd1e1' },
  { name: '成功提交委托', value: 12840, fill: '#82ca9d' },
];

export const MISSED_ORDER_REASONS = [
  { name: '接口超时', value: 45 },
  { name: '无效委托', value: 30 },
  { name: '文件解析失败', value: 25 },
];

export const EFFICIENCY_TREND_DATA = [
  { name: '周一', avgTime: 4.5, totalTime: 4.5, proofreadingTime: 3.0, auditTime: 1.5, submissions: 1200, rejections: 45, reworkRate: 3.8, showLabel: true, tickLabel: '周一' },
  { name: '周二', avgTime: 4.2, totalTime: 4.2, proofreadingTime: 2.8, auditTime: 1.4, submissions: 1350, rejections: 52, reworkRate: 3.9, showLabel: true, tickLabel: '周二' },
  { name: '周三', avgTime: 3.8, totalTime: 3.8, proofreadingTime: 2.5, auditTime: 1.3, submissions: 1400, rejections: 48, reworkRate: 3.4, showLabel: true, tickLabel: '周三' },
  { name: '周四', avgTime: 4.0, totalTime: 4.0, proofreadingTime: 2.7, auditTime: 1.3, submissions: 1280, rejections: 60, reworkRate: 4.7, showLabel: true, tickLabel: '周四' },
  { name: '周五', avgTime: 4.1, totalTime: 4.1, proofreadingTime: 2.7, auditTime: 1.4, submissions: 1450, rejections: 55, reworkRate: 3.8, showLabel: true, tickLabel: '周五' },
  { name: '周六', avgTime: 3.5, totalTime: 3.5, proofreadingTime: 2.3, auditTime: 1.2, submissions: 800, rejections: 30, reworkRate: 3.8, showLabel: true, tickLabel: '周六' },
  { name: '周日', avgTime: 3.2, totalTime: 3.2, proofreadingTime: 2.1, auditTime: 1.1, submissions: 600, rejections: 25, reworkRate: 4.2, showLabel: true, tickLabel: '周日' },
];

export const DATA_QUALITY_DATA = [
  { subject: '文件识别准确率', A: 98, fullMark: 100 },
  { subject: '邮件识别准确率', A: 85, fullMark: 100 },
  { subject: '字段一次通过率', A: 92, fullMark: 100 },
  { subject: '字段未修改率', A: 85, fullMark: 100 },
  { subject: '字段无需补录率', A: 90, fullMark: 100 },
  { subject: '字段保留率', A: 98, fullMark: 100 },
];

export const COST_ANALYSIS_DATA = [
  { name: '1月', cost: 4000, volume: 1000 },
  { name: '2月', cost: 4500, volume: 1150 },
  { name: '3月', cost: 4200, volume: 1100 },
  { name: '4月', cost: 4800, volume: 1300 },
  { name: '5月', cost: 5100, volume: 1400 },
  { name: '6月', cost: 4900, volume: 1350 },
];
