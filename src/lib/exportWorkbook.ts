import * as XLSX from 'xlsx';

type SourceType = 'all' | 'email' | 'file';
type AnalysisView = 'workorder' | 'efficiency';

type FieldRecognitionExportRow = {
  field: string;
  idpAccuracy: string;
  mailAccuracy: string;
};

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
  cost?: Array<{
    name?: string;
    tickLabel?: string;
    cost?: number;
    volume?: number;
    csDays?: number;
    opsDays?: number;
  }>;
  tableData?: Array<Record<string, unknown>>;
  personTableData?: Array<Record<string, unknown>>;
  totalCSDays?: number;
  totalOpsDays?: number;
  metrics?: Record<string, number>;
};

type ExportWorkbookParams = {
  analysisView: AnalysisView;
  source: SourceType;
  org: string;
  startDate: string;
  endDate: string;
  csRate: number;
  opsRate: number;
  originalProofreadingMinutes: number;
  originalAuditMinutes: number;
  data: DashboardData;
  fieldRecognitionRows?: FieldRecognitionExportRow[];
};

const SOURCE_LABEL_MAP: Record<SourceType, string> = {
  all: '全部来源',
  email: '邮件接单',
  file: '文件接单'
};

const toText = (value: unknown) => String(value ?? '');

const toNumber = (value: unknown, fallback: number = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampRatio = (value: number) => Math.max(0, Math.min(1, value));
const toPercent = (ratio: unknown) => `${(clampRatio(toNumber(ratio)) * 100).toFixed(1)}%`;
const toMoney = (value: unknown) => `¥${toNumber(value).toFixed(1)}`;
const toMinutes = (value: unknown) => `${toNumber(value).toFixed(1)}min`;
const toMinutesWithHours = (value: unknown) => `${toNumber(value).toFixed(1)}min (${(toNumber(value) / 60).toFixed(1)}h)`;

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

const parseDateTimeText = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return 0;
  const timestamp = Date.parse(text.replace(/\./g, '-'));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const toDurationWithHours = (durationText: unknown) => {
  const text = toText(durationText).trim();
  if (!text || text === '-') return '-';
  const minutes = parseMinutes(text);
  if (!Number.isFinite(minutes)) return text;
  return `${text}(${(minutes / 60).toFixed(2)}h)`;
};

const toSavedCostPerDetail = (
  item: Record<string, unknown>,
  originalProofreadingMinutes: number,
  originalAuditMinutes: number,
  csRate: number,
  opsRate: number
) => {
  const proofreadingMinutes = parseMinutes(item.proofreadingTime);
  const auditMinutes = parseMinutes(item.auditTime);
  const safeProofreadingMinutes = Number.isFinite(proofreadingMinutes) ? proofreadingMinutes : 0;
  const safeAuditMinutes = Number.isFinite(auditMinutes) ? auditMinutes : 0;
  const savedProofreadingCost = ((originalProofreadingMinutes - safeProofreadingMinutes) * csRate) / 480;
  const savedAuditCost = ((originalAuditMinutes - safeAuditMinutes) * opsRate) / 480;
  return toMoney(savedProofreadingCost + savedAuditCost);
};

const sortByEndedAtDesc = (rows: Array<Record<string, unknown>>) =>
  [...rows].sort((left, right) => {
    const endedAtDiff = parseDateTimeText(right.endedAt) - parseDateTimeText(left.endedAt);
    if (endedAtDiff !== 0) return endedAtDiff;
    return parseDateTimeText(right.createdAt) - parseDateTimeText(left.createdAt);
  });

const buildSavedCostTrendRows = (params: ExportWorkbookParams) =>
  (params.data.efficiency ?? []).map((point) => {
    const proofreadingTime = toNumber(point.proofreadingTime);
    const auditTime = toNumber(point.auditTime);
    const totalTime = toNumber(point.totalTime);
    const volume = toNumber(point.submissions);
    const reworkCount = toNumber(point.rejections);

    const savedProofreadingMinutesPerOrder = params.originalProofreadingMinutes - proofreadingTime;
    const savedAuditMinutesPerOrder = params.originalAuditMinutes - auditTime;
    const savedCost =
      (savedProofreadingMinutesPerOrder * volume * params.csRate) / 480 +
      (savedAuditMinutesPerOrder * volume * params.opsRate) / 480;

    return {
      name: toText(point.tickLabel || point.name),
      savedCost: Number(savedCost.toFixed(1)),
      volume,
      totalTime: Number(totalTime.toFixed(1)),
      proofreadingTime: Number(proofreadingTime.toFixed(1)),
      auditTime: Number(auditTime.toFixed(1)),
      reworkCount
    };
  });

const isSuccessfulWorkOrderDetail = (item: Record<string, unknown>) => {
  const status = toText(item.status).trim();
  const orderId = toText(item.orderId).trim();
  const workOrderId = toText(item.workOrderId).trim();
  return status.includes('成功') && orderId.length > 0 && workOrderId.length > 0;
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
  const timeline = params.data.efficiency ?? [];
  const details = params.data.tableData ?? [];
  const endDate = params.endDate || params.startDate;

  const stageLabels = ['来源输入', '成功创建工单', '工作单', '成功提交委托'];
  const reasonLabels = ['接口超时', '文件解析失败'];
  const totalMissed = missed.reduce((sum, item) => sum + toNumber(item?.value), 0);

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织范围', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['转化率', toPercent(metrics.source_to_ticket_conversion_rate)]);
  rows.push(['漏单率', toPercent(metrics.miss_rate)]);
  addBlankRow(rows);

  rows.push(['业务单量阶段总计', '数量']);
  stageLabels.forEach((label, index) => {
    rows.push([label, toNumber(funnel[index]?.value)]);
  });
  addBlankRow(rows);

  rows.push(['业务单量', '', '', '', '']);
  rows.push(['时间', '来源输入', '成功创建工单', '工作单', '成功提交委托']);
  const sourceInputTotal = toNumber(funnel[0]?.value);
  const createdTotal = toNumber(funnel[1]?.value);
  const transferredTotal = toNumber(funnel[2]?.value);
  const submittedTotal = toNumber(funnel[3]?.value);
  const transferPerSubmit = submittedTotal > 0 ? transferredTotal / submittedTotal : 1;
  const createPerTransfer = transferredTotal > 0 ? createdTotal / transferredTotal : 1;
  const sourcePerCreate = createdTotal > 0 ? sourceInputTotal / createdTotal : 1;

  timeline.forEach((point) => {
    const submitted = Math.max(0, toNumber(point.submissions));
    const transferred = Math.max(submitted, Math.round(submitted * transferPerSubmit));
    const created = Math.max(transferred, Math.round(transferred * createPerTransfer));
    const sourceInput = Math.max(created, Math.round(created * sourcePerCreate));

    rows.push([toText(point.tickLabel || point.name), sourceInput, created, transferred, submitted]);
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
  rows.push(['来源ID', '工单ID', '接单来源', '状态', '漏单原因', '跟进人', '创建时间']);
  details.forEach((item) => {
    rows.push([
      toText(item.sourceId ?? item.workOrderId),
      toText(item.orderId),
      toText(item.source),
      toText(item.status),
      toText(item.reason),
      toText(item.user),
      toText(item.createdAt)
    ]);
  });

  return rows;
};

const buildEfficiencySheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const trend = params.data.efficiency ?? [];
  const details = (params.data.tableData ?? []).filter(isSuccessfulWorkOrderDetail);
  const endDate = params.endDate || params.startDate;

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织范围', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['平均每工作单校对总时长', toMinutes(metrics.avg_proofreading_duration_per_work_order)]);
  rows.push(['平均每工作单审核总时长', toMinutes(metrics.avg_audit_duration_per_work_order)]);
  rows.push(['平均每工作单处理总时长', toMinutes(metrics.avg_processing_duration_per_work_order)]);
  rows.push(['返工率', toPercent(metrics.rework_rate)]);
  rows.push(['平均每工作单提交次数', toNumber(metrics.avg_submit_times_per_work_order).toFixed(2)]);
  addBlankRow(rows);

  rows.push(['时间', '校对时长(min)', '审核时长(min)', '处理总时长(min)', '提交成功', '返工']);
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
  rows.push(['工单ID', '工作单ID', '接单来源', '处理总时长', '校对时长', '跟进人', '审核时长', '审核人', '返工次数', '结束时间']);
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
      toNumber(item.reworkCount),
      toText(item.endedAt)
    ]);
  });

  return rows;
};

const buildQualitySheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const details = sortByEndedAtDesc((params.data.tableData ?? []).filter(isSuccessfulWorkOrderDetail));
  const endDate = params.endDate || params.startDate;
  const fieldRecognitionRows = params.fieldRecognitionRows ?? [];

  const recognitionAccuracy = clampRatio(toNumber(metrics.recognition_accuracy));
  const fileRecognitionAccuracy = clampRatio(toNumber(metrics.file_recognition_accuracy, recognitionAccuracy));
  const mailRecognitionAccuracy = clampRatio(toNumber(metrics.mail_recognition_accuracy, recognitionAccuracy));
  const fieldFirstPassRate = clampRatio(toNumber(metrics.field_first_pass_rate));
  const fieldChangeRate = clampRatio(toNumber(metrics.field_change_rate));
  const fieldSupplementRate = clampRatio(toNumber(metrics.field_supplement_rate));
  const fieldMissRecallRate = clampRatio(toNumber(metrics.field_missrecall_rate));

  // 六芒星按“越大越好”口径导出。
  const dimensions: Array<[string, number]> = [
    ['字段一次通过率', fieldFirstPassRate],
    ['文件识别准确率', fileRecognitionAccuracy],
    ['邮件识别准确率', mailRecognitionAccuracy],
    ['字段未修改率', 1 - fieldChangeRate],
    ['字段无需补录率', 1 - fieldSupplementRate],
    ['字段保留率', 1 - fieldMissRecallRate]
  ];

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织范围', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['核心质量指标（工作单维度）', '值']);
  dimensions.forEach(([label, value]) => rows.push([label, toPercent(value)]));
  addBlankRow(rows);

  if (fieldRecognitionRows.length > 0) {
    const showIdp = params.source !== 'email';
    const showMail = params.source !== 'file';
    const header = ['字段名称'];
    if (showIdp) header.push('IDP');
    if (showMail) header.push('MAIL');

    rows.push(['字段识别准确率（字段维度）']);
    rows.push(header);
    fieldRecognitionRows.forEach((item) => {
      const row = [toText(item.field)];
      if (showIdp) row.push(toText(item.idpAccuracy));
      if (showMail) row.push(toText(item.mailAccuracy));
      rows.push(row);
    });
    addBlankRow(rows);
  }

  addDetailTitle(rows);
  rows.push([
    '工单ID',
    '工作单ID',
    '接单来源',
    '文件识别准确率',
    '邮件识别准确率',
    '字段一次通过率',
    '字段未修改率',
    '字段无需补录率',
    '字段保留率',
    '跟进人',
    '结束时间'
  ]);
  details.forEach((item) => {
    const fileRecognition = toText(item.fileRecognitionAccuracy ?? item.fileRecognition ?? '-');
    const mailRecognition = toText(item.mailRecognitionAccuracy ?? item.mailRecognition ?? '-');

    rows.push([
      toText(item.orderId),
      toText(item.workOrderId),
      toText(item.source),
      fileRecognition,
      mailRecognition,
      toText(item.firstPassRate),
      toInversePercentText(item.fieldModRate),
      toInversePercentText(item.fieldSuppRate),
      toInversePercentText(item.falseRecallRate),
      toText(item.user),
      toText(item.endedAt)
    ]);
  });

  return rows;
};

const buildEfficiencyCostSheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const savedCostTrendRows = buildSavedCostTrendRows(params);
  const details = sortByEndedAtDesc((params.data.tableData ?? []).filter(isSuccessfulWorkOrderDetail));
  const endDate = params.endDate || params.startDate;

  const totalCSDays = toNumber(params.data.totalCSDays);
  const totalOpsDays = toNumber(params.data.totalOpsDays);
  const csHours = totalCSDays * 8;
  const opsHours = totalOpsDays * 8;
  const workOrderSubmitVolume = toNumber(metrics.work_order_submit_volume);
  const avgProofreadingMinutes = toNumber(metrics.avg_proofreading_duration_per_work_order);
  const avgAuditMinutes = toNumber(metrics.avg_audit_duration_per_work_order);
  const savedProofreadingMinutesPerOrder = params.originalProofreadingMinutes - avgProofreadingMinutes;
  const savedAuditMinutesPerOrder = params.originalAuditMinutes - avgAuditMinutes;
  const savedFollowerCost = (savedProofreadingMinutesPerOrder * workOrderSubmitVolume * params.csRate) / 480;
  const savedReviewerCost = (savedAuditMinutesPerOrder * workOrderSubmitVolume * params.opsRate) / 480;
  const totalSavedCost = savedFollowerCost + savedReviewerCost;

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织范围', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['工作单提交量', toNumber(metrics.work_order_submit_volume)]);
  rows.push(['节省总成本', toMoney(totalSavedCost)]);
  rows.push(['客服节省成本', toMoney(savedFollowerCost)]);
  rows.push(['操作节省成本', toMoney(savedReviewerCost)]);
  rows.push(['平均每工作单成本', toMoney(metrics.avg_total_cost_per_work_order)]);
  rows.push(['平均每工作单客服成本', toMoney(metrics.avg_follower_cost_per_work_order)]);
  rows.push(['平均每工作单操作成本', toMoney(metrics.avg_reviewer_cost_per_work_order)]);
  rows.push(['平均处理时长', toMinutes(metrics.avg_processing_duration_per_work_order)]);
  rows.push(['校对时长', toMinutes(metrics.avg_proofreading_duration_per_work_order)]);
  rows.push(['审核时长', toMinutes(metrics.avg_audit_duration_per_work_order)]);
  rows.push(['返工率', toPercent(metrics.rework_rate)]);
  rows.push(['平均每工作单提交次数', toNumber(metrics.avg_submit_times_per_work_order).toFixed(2)]);
  rows.push(['原校对时长', `${params.originalProofreadingMinutes.toFixed(1)}min`]);
  rows.push(['原审核时长', `${params.originalAuditMinutes.toFixed(1)}min`]);
  rows.push(['客服投入时间', `${csHours.toFixed(1)}h（按小时/8计算：${(csHours / 8).toFixed(1)}天）`]);
  rows.push(['客服成本单价', `¥${params.csRate}/人天`]);
  rows.push(['操作投入时间', `${opsHours.toFixed(1)}h（按小时/8计算：${(opsHours / 8).toFixed(1)}天）`]);
  rows.push(['操作成本单价', `¥${params.opsRate}/人天`]);
  addBlankRow(rows);

  rows.push(['节省成本与单量趋势']);
  rows.push(['时间', '节省成本(¥)', '工作单提交量']);
  savedCostTrendRows.forEach((point) => {
    rows.push([
      point.name,
      point.savedCost.toFixed(1),
      point.volume
    ]);
  });
  addBlankRow(rows);

  rows.push(['平均处理时长趋势']);
  rows.push(['时间', '处理总时长(min)', '校对时长(min)', '审核时长(min)']);
  savedCostTrendRows.forEach((point) => {
    rows.push([point.name, point.totalTime.toFixed(1), point.proofreadingTime.toFixed(1), point.auditTime.toFixed(1)]);
  });
  addBlankRow(rows);

  rows.push(['工作单提交与返工分布']);
  rows.push(['时间', '提交成功', '返工']);
  savedCostTrendRows.forEach((point) => {
    rows.push([point.name, point.volume, point.reworkCount]);
  });
  addBlankRow(rows);

  addDetailTitle(rows);
  rows.push([
    '工单ID',
    '工作单ID',
    '接单来源',
    '节省成本',
    '处理成本',
    '处理时长',
    '校对成本',
    '校对时长',
    '跟进人',
    '审核成本',
    '审核时长',
    '审核人',
    '返工次数',
    '结束时间'
  ]);
  details.forEach((item) => {
    rows.push([
      toText(item.orderId),
      toText(item.workOrderId),
      toText(item.source),
      toSavedCostPerDetail(
        item,
        params.originalProofreadingMinutes,
        params.originalAuditMinutes,
        params.csRate,
        params.opsRate
      ),
      toText(item.processingCost),
      toDurationWithHours(item.totalTime),
      toText(item.proofreadingCost),
      toText(item.proofreadingTime),
      toText(item.user),
      toText(item.auditCost),
      toText(item.auditTime),
      toText(item.auditor),
      toNumber(item.reworkCount),
      toText(item.endedAt)
    ]);
  });

  return rows;
};

const buildEfficiencyPersonSheet = (params: ExportWorkbookParams) => {
  const rows: unknown[][] = [];
  const metrics = params.data.metrics ?? {};
  const endDate = params.endDate || params.startDate;
  const details = [...(params.data.personTableData ?? [])].sort(
    (left, right) => toNumber(right.processingCount) - toNumber(left.processingCount)
  );

  const workOrderSubmitVolume = toNumber(metrics.work_order_submit_volume);
  const participantCount = toNumber(metrics.participant_user_count);
  const avgInputMinutes = toNumber(metrics.avg_efficiency_input_duration_per_person);
  const avgLaborCost = toNumber(metrics.avg_efficiency_labor_cost_per_person);
  const totalSavedCost = details.reduce((sum, item) => {
    const processingCount = toNumber(item.processingCount);
    const avgProofreading = toNumber(item.avgProofreadingMinutes);
    const avgAudit = toNumber(item.avgAuditMinutes);
    const savedProofreading =
      avgProofreading > 0
        ? ((params.originalProofreadingMinutes - avgProofreading) * processingCount * params.csRate) / 480
        : 0;
    const savedAudit =
      avgAudit > 0
        ? ((params.originalAuditMinutes - avgAudit) * processingCount * params.opsRate) / 480
        : 0;
    return sum + savedProofreading + savedAudit;
  }, 0);

  addSummaryTitle(rows);
  rows.push(['来源', SOURCE_LABEL_MAP[params.source]]);
  rows.push(['组织范围', toText(params.org)]);
  rows.push(['时间', `${params.startDate}~${endDate}`]);
  addBlankRow(rows);

  rows.push(['指标', '值']);
  rows.push(['参与处理人数', participantCount]);
  rows.push(['工作单提交量', workOrderSubmitVolume]);
  rows.push(['处理单量', workOrderSubmitVolume]);
  rows.push(['平均投入时长', toMinutes(avgInputMinutes)]);
  rows.push(['平均人力成本', toMoney(avgLaborCost)]);
  rows.push(['节省总成本', toMoney(totalSavedCost)]);
  addBlankRow(rows);

  addDetailTitle(rows);
  rows.push([
    '人员',
    '业务部门（分公司）',
    '处理单量',
    '平均投入时长',
    '投入总时长',
    '时长成本',
    '节省成本'
  ]);

  details.forEach((item) => {
    const processingCount = toNumber(item.processingCount);
    const avgProofreading = toNumber(item.avgProofreadingMinutes);
    const avgAudit = toNumber(item.avgAuditMinutes);
    const savedCost =
      (avgProofreading > 0
        ? ((params.originalProofreadingMinutes - avgProofreading) * processingCount * params.csRate) / 480
        : 0) +
      (avgAudit > 0
        ? ((params.originalAuditMinutes - avgAudit) * processingCount * params.opsRate) / 480
        : 0);

    rows.push([
      toText(item.person),
      toText(item.department),
      processingCount,
      toMinutesWithHours(item.avgProcessingMinutes),
      toMinutesWithHours(item.totalProcessingMinutes),
      toMoney(item.processingCostValue),
      toMoney(savedCost)
    ]);
  });

  return rows;
};

const createSheet = (rows: unknown[][]) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  sheet['!cols'] = Array.from({ length: colCount }, () => ({ wch: 20 }));
  return sheet;
};

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const downloadBlobByLink = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Some browsers may not finish persisting the file if the object URL is revoked immediately.
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1500);
};

const saveBlobWithPicker = async (blob: Blob, filename: string) => {
  if (typeof window === 'undefined') return false;

  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (typeof pickerWindow.showSaveFilePicker !== 'function') {
    return false;
  }

  try {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: 'Excel 工作簿',
          accept: {
            [EXCEL_MIME_TYPE]: ['.xlsx']
          }
        }
      ]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }
    return false;
  }
};

export const exportDashboardWorkbook = async (params: ExportWorkbookParams) => {
  const sourceLabel = SOURCE_LABEL_MAP[params.source];
  const orgLabel = toText(params.org);
  const endDate = params.endDate || params.startDate;
  const compactStartDate = params.startDate.replace(/-/g, '');
  const compactEndDate = endDate.replace(/-/g, '');
  const timeLabel = compactStartDate === compactEndDate ? compactStartDate : `${compactStartDate}~${compactEndDate}`;
  const filenamePrefix = params.analysisView === 'efficiency' ? '人效分析' : '工作单分析';

  const workbook = XLSX.utils.book_new();

  if (params.analysisView === 'efficiency') {
    XLSX.utils.book_append_sheet(workbook, createSheet(buildEfficiencyPersonSheet(params)), '人效分析');
  } else {
    XLSX.utils.book_append_sheet(workbook, createSheet(buildConversionSheet(params)), '转化分析');
    XLSX.utils.book_append_sheet(workbook, createSheet(buildQualitySheet(params)), '数据质量分析');
    XLSX.utils.book_append_sheet(workbook, createSheet(buildEfficiencyCostSheet(params)), '效率成本分析');
  }

  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buffer], {
    type: EXCEL_MIME_TYPE
  });

  const filename = `${safeNamePart(filenamePrefix)}-${safeNamePart(sourceLabel)}-${safeNamePart(orgLabel)}-${safeNamePart(timeLabel)}.xlsx`;

  if (!(await saveBlobWithPicker(blob, filename))) {
    downloadBlobByLink(blob, filename);
  }
};
