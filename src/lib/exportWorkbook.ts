import * as XLSX from 'xlsx';

type SourceType = 'all' | 'email' | 'file';

type DashboardData = {
  funnel?: Array<{ name?: string; value?: number }>;
  missed?: Array<{ name?: string; value?: number }>;
  efficiency?: Array<{
    name?: string;
    tickLabel?: string;
    totalTime?: number;
    proofreadingTime?: number;
    auditTime?: number;
    submissions?: number;
    rejections?: number;
  }>;
  quality?: Array<{ subject?: string; A?: number }>;
  cost?: Array<{ name?: string; tickLabel?: string; cost?: number; volume?: number; csDays?: number; opsDays?: number }>;
  tableData?: Array<Record<string, unknown>>;
  totalCSDays?: number;
  totalOpsDays?: number;
  metrics?: Record<string, number>;
};

type ExportWorkbookParams = {
  source: SourceType;
  org: string;
  startDate: string;
  endDate: string;
  csRate: number;
  opsRate: number;
  data: DashboardData;
};

const SOURCE_LABEL_MAP: Record<SourceType, string> = {
  all: '全部来源',
  email: '邮件接单',
  file: '文件接单'
};

// 兼容历史脏数据中的乱码文本，导出时统一还原到可读中文。
const TEXT_FIX_MAP: Record<string, string> = {
  '鍏ㄥ叕鍙?': '全公司',
  '鍑哄彛涓氬姟閮?': '出口业务部',
  '璁㈣埍鎿嶄綔閮?': '订舱操作部',
  '寮犱笁': '张三',
  '鏉庡洓': '李四',
  '鐜嬩簲': '王五',
  '璧靛叚': '赵六',
  '閭欢': '邮件',
  '鏂囦欢': '文件'
};

const toText = (value: unknown) => {
  const text = String(value ?? '');
  return TEXT_FIX_MAP[text] ?? text;
};

const toNumber = (value: unknown, fallback: number = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const clampRatio = (value: number) => Math.max(0, Math.min(1, value));
const toPercent = (ratio: unknown) => `${(clampRatio(toNumber(ratio)) * 100).toFixed(1)}%`;
const toMoney = (value: unknown) => `¥${toNumber(value).toFixed(1)}`;
const toMinutes = (value: unknown) => `${toNumber(value).toFixed(1)}min`;

const parsePercentRatio = (value: unknown) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed > 1 ? parsed / 100 : parsed;
};

const toInversePercentText = (value: unknown) => {
  const ratio = parsePercentRatio(value);
  if (!Number.isFinite(ratio)) return '-';
  return `${(clampRatio(1 - ratio) * 100).toFixed(1)}%`;
};

const parseMinutes = (durationText: unknown) => {
  const match = String(durationText ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
};

const toDurationWithHours = (durationText: unknown) => {
  const text = toText(durationText).trim();
  if (!text || text === '-') return '-';
  const minutes = parseMinutes(text);
  if (!Number.isFinite(minutes)) return text;
  return `${text}(${(minutes / 60).toFixed(2)}h)`;
};

const safeNamePart = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';

const addBlankRow = (rows: unknown[][]) => rows.push([]);
const addSummaryTitle = (rows: unknown[][]) => rows.push(['总（总结数据）']);
const addDetailTitle = (rows: unknown[][]) => rows.push(['分（明细表结构）']);

const buildConversionSheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const funnel = params.data.funnel ?? [];
  const missed = params.data.missed ?? [];
  const details = params.data.tableData ?? [];
  const endDate = params.endDate || params.startDate;

  const stageLabels = ['来源输入', '成功创建工单', '转工作单', '成功提交委托'];
  const reasonLabels = ['接口超时', '无效委托', '文件解析失败'];
  const totalMissed = missed.reduce((sum, item) => sum + toNumber(item?.value), 0);

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['来源转工单转化率', toPercent(metrics.source_to_ticket_conversion_rate)]);
  rows.push(['漏单率', toPercent(metrics.miss_rate)]);
  addBlankRow(rows);

  rows.push(['漏斗阶段', '数量']);
  stageLabels.forEach((label, index) => {
    rows.push([label, toNumber(funnel[index]?.value)]);
  });
  addBlankRow(rows);

  rows.push(['漏单原因', '数量', '占比']);
  reasonLabels.forEach((label, index) => {
    const value = toNumber(missed[index]?.value);
    const ratio = totalMissed > 0 ? `${((value / totalMissed) * 100).toFixed(1)}%` : '0.0%';
    rows.push([label, value, ratio]);
  });
  addBlankRow(rows);

  addDetailTitle(rows);
  rows.push(['工单ID', '工作单ID', '接单来源', '状态', '漏单原因', '跟进人']);
  details.forEach((item) => {
    rows.push([
      toText(item.orderId),
      toText(item.workOrderId),
      toText(item.source),
      toText(item.status),
      toText(item.reason),
      toText(item.user)
    ]);
  });

  return rows;
};

const buildEfficiencySheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const trend = params.data.efficiency ?? [];
  const details = params.data.tableData ?? [];
  const endDate = params.endDate || params.startDate;

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['平均每工作单校对总时长', toMinutes(metrics.avg_proofreading_duration_per_work_order)]);
  rows.push(['平均每工作单审核总时长', toMinutes(metrics.avg_audit_duration_per_work_order)]);
  rows.push(['平均每工作单处理总时长', toMinutes(metrics.avg_processing_duration_per_work_order)]);
  rows.push(['返工率', toPercent(metrics.rework_rate)]);
  rows.push(['平均每工作单提交次数', toNumber(metrics.avg_submit_times_per_work_order).toFixed(2)]);
  addBlankRow(rows);

  rows.push(['时间', '校对时长(min)', '审核时长(min)', '处理总时长(min)', '提交成功', '驳回/返工']);
  trend.forEach((point) => {
    rows.push([
      toText(point.tickLabel || point.name),
      toNumber(point.proofreadingTime).toFixed(1),
      toNumber(point.auditTime).toFixed(1),
      toNumber(point.totalTime).toFixed(1),
      toNumber(point.submissions),
      toNumber(point.rejections)
    ]);
  });
  addBlankRow(rows);

  addDetailTitle(rows);
  rows.push(['工单ID', '工作单ID', '接单来源', '处理总时长', '校对时长', '跟进人', '审核时长', '审核人', '返工次数']);
  details.forEach((item) => {
    rows.push([
      toText(item.orderId),
      toText(item.workOrderId),
      toText(item.source),
      toText(item.totalTime),
      toText(item.proofreadingTime),
      toText(item.user),
      toText(item.auditTime),
      toText(item.auditor),
      toNumber(item.reworkCount)
    ]);
  });

  return rows;
};

const buildQualitySheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const details = params.data.tableData ?? [];
  const endDate = params.endDate || params.startDate;

  const recognitionAccuracy = clampRatio(toNumber(metrics.recognition_accuracy));
  const prefillRate = clampRatio(toNumber(metrics.prefill_rate));
  const fieldFirstPassRate = clampRatio(toNumber(metrics.field_first_pass_rate));
  const fieldChangeRate = clampRatio(toNumber(metrics.field_change_rate));
  const fieldSupplementRate = clampRatio(toNumber(metrics.field_supplement_rate));
  const fieldMissRecallRate = clampRatio(toNumber(metrics.field_missrecall_rate));

  // 六芒星统一按“越大越好”展示口径。
  const dimensions: Array<[string, number]> = [
    ['识别准确率', recognitionAccuracy],
    ['信息预填率', prefillRate],
    ['字段一次通过率', fieldFirstPassRate],
    ['字段未修改率', 1 - fieldChangeRate],
    ['字段无需补录率', 1 - fieldSupplementRate],
    ['字段保留率', 1 - fieldMissRecallRate]
  ];

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  dimensions.forEach(([label, value]) => rows.push([label, toPercent(value)]));
  addBlankRow(rows);

  rows.push(['质量维度', '得分']);
  dimensions.forEach(([label, value]) => rows.push([label, `${(value * 100).toFixed(1)}%`]));
  addBlankRow(rows);

  addDetailTitle(rows);
  rows.push([
    '工单ID',
    '工作单ID',
    '接单来源',
    '识别准确率',
    '信息预填率',
    '字段一次通过率',
    '字段未修改率',
    '字段无需补录率',
    '字段保留率',
    '跟进人'
  ]);
  details.forEach((item) => {
    rows.push([
      toText(item.orderId),
      toText(item.workOrderId),
      toText(item.source),
      toText(item.accuracy),
      toText(item.preFillRate),
      toText(item.firstPassRate),
      toInversePercentText(item.fieldModRate),
      toInversePercentText(item.fieldSuppRate),
      toInversePercentText(item.falseRecallRate),
      toText(item.user)
    ]);
  });

  return rows;
};

const buildCostSheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const trend = params.data.cost ?? [];
  const details = params.data.tableData ?? [];
  const endDate = params.endDate || params.startDate;
  const totalCSDays = toNumber(params.data.totalCSDays);
  const totalOpsDays = toNumber(params.data.totalOpsDays);
  const csHours = totalCSDays * 8;
  const opsHours = totalOpsDays * 8;

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['工作单提交量', toNumber(metrics.work_order_submit_volume)]);
  rows.push(['平均每工作单客服成本', toMoney(metrics.avg_follower_cost_per_work_order)]);
  rows.push(['客服总成本', toMoney(metrics.total_follower_cost)]);
  rows.push(['平均每工作单操作成本', toMoney(metrics.avg_reviewer_cost_per_work_order)]);
  rows.push(['操作总成本', toMoney(metrics.total_reviewer_cost)]);
  rows.push(['平均每工作单总成本', toMoney(metrics.avg_total_cost_per_work_order)]);
  rows.push(['总人力成本', toMoney(metrics.total_labor_cost)]);
  rows.push(['客服投入时间', `${csHours.toFixed(1)}h（按小时/8计算：${(csHours / 8).toFixed(1)}天）`]);
  rows.push(['操作投入时间', `${opsHours.toFixed(1)}h（按小时/8计算：${(opsHours / 8).toFixed(1)}天）`]);
  rows.push(['客服成本单价', `¥${params.csRate}/人天`]);
  rows.push(['操作成本单价', `¥${params.opsRate}/人天`]);
  addBlankRow(rows);

  rows.push(['时间', '总人力成本(¥)', '工作单提交量', '客服投入时间(h)', '操作投入时间(h)']);
  trend.forEach((point) => {
    rows.push([
      toText(point.tickLabel || point.name),
      toNumber(point.cost).toFixed(1),
      toNumber(point.volume),
      (toNumber(point.csDays) * 8).toFixed(1),
      (toNumber(point.opsDays) * 8).toFixed(1)
    ]);
  });
  addBlankRow(rows);

  addDetailTitle(rows);
  rows.push(['工单ID', '工作单ID', '接单来源', '处理成本', '处理时长', '校对成本', '校对时长', '跟进人', '审核成本', '审核时长', '审核人']);
  details.forEach((item) => {
    rows.push([
      toText(item.orderId),
      toText(item.workOrderId),
      toText(item.source),
      toText(item.processingCost),
      toDurationWithHours(item.totalTime),
      toText(item.proofreadingCost),
      toText(item.proofreadingTime),
      toText(item.user),
      toText(item.auditCost),
      toText(item.auditTime),
      toText(item.auditor)
    ]);
  });

  return rows;
};

const createSheet = (rows: unknown[][], colCount: number) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = Array.from({ length: colCount }, () => ({ wch: 20 }));
  return sheet;
};

export const exportDashboardWorkbook = (params: ExportWorkbookParams) => {
  const sourceLabel = SOURCE_LABEL_MAP[params.source];
  const orgLabel = toText(params.org);
  const endDate = params.endDate || params.startDate;
  const timeLabel = params.startDate === endDate ? params.startDate : `${params.startDate}_${endDate}`;

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, createSheet(buildConversionSheet(params), 8), '转化分析');
  XLSX.utils.book_append_sheet(workbook, createSheet(buildEfficiencySheet(params), 10), '效率分析');
  XLSX.utils.book_append_sheet(workbook, createSheet(buildQualitySheet(params), 11), '数据质量分析');
  XLSX.utils.book_append_sheet(workbook, createSheet(buildCostSheet(params), 12), '成本分析');

  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const filename = `${safeNamePart(sourceLabel)}-${safeNamePart(orgLabel)}-${safeNamePart(timeLabel)}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
