import {
  MOCK_KPI_DATA,
  CONVERSION_FUNNEL_DATA,
  MISSED_ORDER_REASONS,
  DATA_QUALITY_DATA
} from '../constants/mockData';

const MINUTES_PER_WORKDAY = 8 * 60;

type KpiTrend = 'up' | 'down' | 'neutral';

type KpiMom = {
  trend: KpiTrend;
  percentage: string;
};

type GetDynamicDataOptions = {
  disableComparison?: boolean;
};

type PointBucket = {
  date: Date;
  label: string;
  showLabel: boolean;
  tickLabel?: string;
  startTs: number;
  endTs: number;
};

type WorkOrderRecord = {
  orderId: string;
  workOrderId: string;
  bucketIndex: number;
  source: string;
  status: '成功' | '失败';
  reason: string;
  user: string;
  auditor: string;
  submitTimes: number;
  reworkCount: number;
  proofreadingMinutes: number;
  auditMinutes: number;
  processingMinutes: number;
  csDays: number;
  opsDays: number;
  proofreadingCostValue: number;
  auditCostValue: number;
  processingCostValue: number;
  accuracy: string;
  preFillRate: string;
  firstPassRate: string;
  fieldModRate: string;
  fieldSuppRate: string;
  falseRecallRate: string;
  proofreadingCost: string;
  auditCost: string;
  processingCost: string;
  proofreadingTime: string;
  auditTime: string;
  totalTime: string;
};

const seededRandom = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const toPercent = (numerator: number, denominator: number) => (denominator > 0 ? (numerator / denominator) * 100 : 0);

const toFiveDigitId = (seed: string, offset: number = 0) => {
  const raw = Math.floor(seededRandom(seed) * 90000);
  const normalized = ((raw + offset) % 90000 + 90000) % 90000;
  return String(10000 + normalized);
};

const containsAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

const normalizePersonName = (name: string) => {
  const n = name || '';
  if (containsAny(n, ['张三', '寮犱笁'])) return '张三';
  if (containsAny(n, ['李四', '鏉庡洓'])) return '李四';
  if (containsAny(n, ['王五', '鐜嬩簲'])) return '王五';
  if (containsAny(n, ['赵六', '璧靛叚'])) return '赵六';
  if (containsAny(n, ['管理员', '绠＄悊鍛'])) return '管理员';
  return n;
};

const resolveOrgType = (org: string) => {
  const o = org || '';

  if (o === 'all' || containsAny(o, ['全公司', '鍏ㄥ叕鍙'])) return 'all';
  if (o === 'dept-1' || containsAny(o, ['出口业务部', '鍑哄彛涓氬姟閮'])) return 'dept-1';
  if (o === 'dept-2' || containsAny(o, ['订舱操作部', '璁㈣埍鎿嶄綔閮'])) return 'dept-2';

  if (o === 'user-1' || containsAny(o, ['张三', '寮犱笁'])) return 'user-1';
  if (o === 'user-2' || containsAny(o, ['李四', '鏉庡洓'])) return 'user-2';
  if (o === 'user-3' || containsAny(o, ['王五', '鐜嬩簲'])) return 'user-3';
  if (o === 'user-4' || containsAny(o, ['赵六', '璧靛叚'])) return 'user-4';

  return 'custom';
};

const parseUtcDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
};

const formatUtcDate = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysUtc = (dateStr: string, days: number) => {
  const date = parseUtcDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
};

const calcMom = (current: number, previous: number): KpiMom => {
  const epsilon = 1e-9;
  const delta = current - previous;

  let trend: KpiTrend = 'neutral';
  if (delta > epsilon) trend = 'up';
  if (delta < -epsilon) trend = 'down';

  let changeRatio = 0;
  if (Math.abs(previous) <= epsilon) {
    changeRatio = Math.abs(current) <= epsilon ? 0 : 1;
  } else {
    changeRatio = delta / Math.abs(previous);
  }

  return {
    trend,
    percentage: `${(Math.abs(changeRatio) * 100).toFixed(1)}%`
  };
};

const startOfDayTs = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const getDynamicData = (
  startDate: string,
  endDate: string,
  org: string,
  source: string,
  csRate: number = 200,
  opsRate: number = 300,
  options: GetDynamicDataOptions = {}
) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const orgType = resolveOrgType(org);

  let peopleCount = 1;
  if (orgType === 'all') {
    peopleCount = 4;
  } else if (orgType === 'dept-1' || orgType === 'dept-2') {
    peopleCount = 2;
  }

  let sourceFactor = 1;
  if (source === 'email') sourceFactor = 0.6;
  if (source === 'file') sourceFactor = 0.4;
  if (source === 'all') sourceFactor = 1.0;

  let efficiencyFactor = 1.0;
  if (diffDays === 1) {
    efficiencyFactor = 0.8;
  } else if (diffDays > 7) {
    efficiencyFactor = 1.1;
  }

  const baseVolume = 15;
  const targetWorkOrderCount = Math.max(
    1,
    Math.round(baseVolume * peopleCount * diffDays * sourceFactor * efficiencyFactor)
  );

  const points: PointBucket[] = [];

  if (diffDays <= 1) {
    for (let i = 9; i <= 18; i++) {
      const d = new Date(start);
      d.setHours(i, 0, 0, 0);
      const startTs = d.getTime();
      points.push({
        date: d,
        label: `${i}:00`,
        showLabel: true,
        startTs,
        endTs: startTs + 60 * 60 * 1000
      });
    }
  } else if (diffDays <= 7) {
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const startTs = startOfDayTs(d);
      points.push({
        date: d,
        label: d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        showLabel: true,
        startTs,
        endTs: startTs + 24 * 60 * 60 * 1000
      });
    }
  } else if (diffDays <= 31) {
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const isWeekly = i % 7 === 0 || i === diffDays - 1;
      const startTs = startOfDayTs(d);
      points.push({
        date: d,
        label: d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        showLabel: isWeekly,
        tickLabel: isWeekly ? `第${Math.floor(i / 7) + 1}周` : '',
        startTs,
        endTs: startTs + 24 * 60 * 60 * 1000
      });
    }
  } else {
    for (let i = 0; i < diffDays; i += 7) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const isFirstInMonth = d.getDate() <= 7;
      const startTs = startOfDayTs(d);
      const endD = new Date(start);
      endD.setDate(start.getDate() + Math.min(i + 7, diffDays));
      const endTs = Math.max(startTs + 24 * 60 * 60 * 1000, startOfDayTs(endD));
      points.push({
        date: d,
        label: d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        showLabel: isFirstInMonth,
        tickLabel: isFirstInMonth ? `${d.getMonth() + 1}月` : '',
        startTs,
        endTs
      });
    }
  }

  const sourceLabels = source === 'all' ? ['邮件', '文件'] : [source === 'email' ? '邮件' : '文件'];

  const roleUsers = {
    followers: ['张三', '李四'], // 出口业务部 / 客服部 -> 跟进人
    reviewers: ['王五', '赵六'] // 订舱操作部 / 操作部 -> 审核人
  };
  const allUsers = [...roleUsers.followers, ...roleUsers.reviewers];

  let followerPrimaryWeight = 0.9;
  let reviewerPrimaryWeight = 0.9;
  let specificFollower: string | null = null;
  let specificReviewer: string | null = null;

  if (orgType === 'dept-1') {
    followerPrimaryWeight = 0.95;
    reviewerPrimaryWeight = 0.9;
  } else if (orgType === 'dept-2') {
    followerPrimaryWeight = 0.9;
    reviewerPrimaryWeight = 0.95;
  } else if (orgType === 'user-1') {
    specificFollower = '张三';
  } else if (orgType === 'user-2') {
    specificFollower = '李四';
  } else if (orgType === 'user-3') {
    specificReviewer = '王五';
  } else if (orgType === 'user-4') {
    specificReviewer = '赵六';
  } else if (orgType === 'custom') {
    const normalized = normalizePersonName(org) || '管理员';
    specificFollower = normalized;
    specificReviewer = normalized;
  }

  const reasons = ['接口超时', '文件解析失败', '无效委托'];

  let totalFieldCount = 0;
  let totalRecognizedCorrect = 0;
  let totalPrefilled = 0;
  let totalNoChange = 0;
  let totalChanged = 0;
  let totalSupplemented = 0;
  let totalMissRecalled = 0;

  const workOrders: WorkOrderRecord[] = Array.from({ length: targetWorkOrderCount }).map((_, i) => {
    const seed = `${org}|${source}|${startDate}|${endDate}|${i}`;

    const bucketIndex = Math.floor(seededRandom(`${seed}|bucket`) * points.length);
    const sourceLabel = sourceLabels[Math.floor(seededRandom(`${seed}|source`) * sourceLabels.length)];

    const proofreadingMinutes = round1(4 + seededRandom(`${seed}|proof`) * 4);
    const auditMinutes = round1(2 + seededRandom(`${seed}|audit`) * 3);
    const processingMinutes = round1(proofreadingMinutes + auditMinutes);

    const submitRand = seededRandom(`${seed}|submit_times`);
    const submitTimes = submitRand < 0.78 ? 1 : submitRand < 0.95 ? 2 : 3;
    const reworkCount = Math.max(0, submitTimes - 1);

    const status: '成功' | '失败' = seededRandom(`${seed}|status`) > 0.08 ? '成功' : '失败';
    const reason = status === '失败' ? reasons[Math.floor(seededRandom(`${seed}|reason`) * reasons.length)] : '-';

    const userPool =
      seededRandom(`${seed}|user_role`) < followerPrimaryWeight ? roleUsers.followers : allUsers;
    const auditorPool =
      seededRandom(`${seed}|auditor_role`) < reviewerPrimaryWeight ? roleUsers.reviewers : allUsers;

    const user = specificFollower || userPool[Math.floor(seededRandom(`${seed}|user`) * userPool.length)];
    let auditor = specificReviewer || auditorPool[Math.floor(seededRandom(`${seed}|auditor`) * auditorPool.length)];

    if (!specificReviewer && auditor === user) {
      const fallbackPool = roleUsers.reviewers.filter((name) => name !== user);
      const finalPool = fallbackPool.length > 0 ? fallbackPool : allUsers.filter((name) => name !== user);
      if (finalPool.length > 0) {
        auditor = finalPool[Math.floor(seededRandom(`${seed}|auditor_fallback`) * finalPool.length)];
      }
    }

    const csDays = proofreadingMinutes / MINUTES_PER_WORKDAY;
    const opsDays = auditMinutes / MINUTES_PER_WORKDAY;
    const proofreadingCostValue = csDays * csRate;
    const auditCostValue = opsDays * opsRate;
    const processingCostValue = proofreadingCostValue + auditCostValue;

    const fieldCount = 24 + Math.floor(seededRandom(`${seed}|field_count`) * 16);
    const recognizedCorrect = Math.round(fieldCount * (0.9 + seededRandom(`${seed}|recognized`) * 0.09));
    const prefilled = Math.round(fieldCount * (0.72 + seededRandom(`${seed}|prefill`) * 0.24));
    const emptyInitial = Math.max(0, fieldCount - prefilled);

    // 非空初始值 -> [一次通过(有值A->有值A), 修改(有值A->有值B), 误召回(有值->空)]
    let changed = Math.round(prefilled * (0.08 + seededRandom(`${seed}|changed_nonempty`) * 0.24));
    let missRecalled = Math.round(prefilled * (0.02 + seededRandom(`${seed}|miss_recall_nonempty`) * 0.1));
    if (changed + missRecalled > prefilled) {
      const scale = prefilled / (changed + missRecalled);
      changed = Math.round(changed * scale);
      missRecalled = Math.max(0, prefilled - changed);
    }
    const noChangeFromPrefilled = Math.max(0, prefilled - changed - missRecalled);

    // 空初始值 -> [补录(空->非空), 一次通过(空->空)]
    let supplemented = Math.round(emptyInitial * (0.35 + seededRandom(`${seed}|supplement_empty`) * 0.5));
    supplemented = Math.min(Math.max(0, supplemented), emptyInitial);
    const noChangeFromEmpty = Math.max(0, emptyInitial - supplemented);

    const noChange = noChangeFromPrefilled + noChangeFromEmpty;

    totalFieldCount += fieldCount;
    totalRecognizedCorrect += recognizedCorrect;
    totalPrefilled += prefilled;
    totalNoChange += noChange;
    totalChanged += changed;
    totalSupplemented += supplemented;
    totalMissRecalled += missRecalled;

    return {
      orderId: toFiveDigitId(`${seed}|oid`, i * 17),
      workOrderId: toFiveDigitId(`${seed}|woid`, i * 23 + 7),
      bucketIndex,
      source: sourceLabel,
      status,
      reason,
      user,
      auditor,
      submitTimes,
      reworkCount,
      proofreadingMinutes,
      auditMinutes,
      processingMinutes,
      csDays,
      opsDays,
      proofreadingCostValue,
      auditCostValue,
      processingCostValue,
      accuracy: `${toPercent(recognizedCorrect, fieldCount).toFixed(1)}%`,
      preFillRate: `${toPercent(prefilled, fieldCount).toFixed(1)}%`,
      firstPassRate: `${toPercent(noChange, fieldCount).toFixed(1)}%`,
      fieldModRate: `${toPercent(changed, fieldCount).toFixed(1)}%`,
      fieldSuppRate: `${toPercent(supplemented, fieldCount).toFixed(1)}%`,
      falseRecallRate: `${toPercent(missRecalled, fieldCount).toFixed(1)}%`,
      proofreadingCost: `¥${proofreadingCostValue.toFixed(1)}`,
      auditCost: `¥${auditCostValue.toFixed(1)}`,
      processingCost: `¥${processingCostValue.toFixed(1)}`,
      proofreadingTime: `${proofreadingMinutes.toFixed(1)}min`,
      auditTime: `${auditMinutes.toFixed(1)}min`,
      totalTime: `${processingMinutes.toFixed(1)}min`
    };
  });

  const bucketStats = points.map(() => ({
    submissions: 0,
    reworkOrders: 0,
    submitTimesSum: 0,
    proofSum: 0,
    auditSum: 0,
    processingSum: 0,
    csDaysSum: 0,
    opsDaysSum: 0,
    costSum: 0
  }));

  for (const order of workOrders) {
    if (order.status !== '成功') continue;
    const stat = bucketStats[order.bucketIndex];
    stat.submissions += 1;
    stat.reworkOrders += order.submitTimes >= 2 ? 1 : 0;
    stat.submitTimesSum += order.submitTimes;
    stat.proofSum += order.proofreadingMinutes;
    stat.auditSum += order.auditMinutes;
    stat.processingSum += order.processingMinutes;
    stat.csDaysSum += order.csDays;
    stat.opsDaysSum += order.opsDays;
    stat.costSum += order.processingCostValue;
  }

  const efficiency = points.map((point, idx) => {
    const stat = bucketStats[idx];
    const submissions = stat.submissions;
    const rejections = stat.reworkOrders;

    const proofreadingTime = submissions > 0 ? round1(stat.proofSum / submissions) : 0;
    const auditTime = submissions > 0 ? round1(stat.auditSum / submissions) : 0;
    const totalTime = submissions > 0 ? round1(stat.processingSum / submissions) : 0;

    const reworkRate = submissions > 0 ? (rejections / submissions) * 100 : 0;

    return {
      name: point.label,
      tickLabel: point.tickLabel || point.label,
      showLabel: point.showLabel,
      proofreadingTime,
      auditTime,
      totalTime,
      submissions,
      rejections,
      reworkRate: reworkRate.toFixed(1)
    };
  });

  const costTrend = points.map((point, idx) => {
    const stat = bucketStats[idx];
    return {
      name: point.label,
      tickLabel: point.tickLabel || point.label,
      showLabel: point.showLabel,
      cost: Math.round(stat.costSum),
      volume: stat.submissions,
      csDays: stat.csDaysSum,
      opsDays: stat.opsDaysSum
    };
  });

  const totalCSDays = bucketStats.reduce((acc, stat) => acc + stat.csDaysSum, 0);
  const totalOpsDays = bucketStats.reduce((acc, stat) => acc + stat.opsDaysSum, 0);
  const totalCalculatedCost = bucketStats.reduce((acc, stat) => acc + stat.costSum, 0);
  const workOrderSubmitVolume = bucketStats.reduce((acc, stat) => acc + stat.submissions, 0);

  const avgProofreadingDurationPerWorkOrder =
    workOrderSubmitVolume > 0
      ? bucketStats.reduce((acc, stat) => acc + stat.proofSum, 0) / workOrderSubmitVolume
      : 0;
  const avgAuditDurationPerWorkOrder =
    workOrderSubmitVolume > 0
      ? bucketStats.reduce((acc, stat) => acc + stat.auditSum, 0) / workOrderSubmitVolume
      : 0;
  const avgProcessingDurationPerWorkOrder =
    workOrderSubmitVolume > 0
      ? bucketStats.reduce((acc, stat) => acc + stat.processingSum, 0) / workOrderSubmitVolume
      : 0;
  const reworkRate =
    workOrderSubmitVolume > 0
      ? bucketStats.reduce((acc, stat) => acc + stat.reworkOrders, 0) / workOrderSubmitVolume
      : 0;
  const avgSubmitTimesPerWorkOrder =
    workOrderSubmitVolume > 0
      ? bucketStats.reduce((acc, stat) => acc + stat.submitTimesSum, 0) / workOrderSubmitVolume
      : 0;

  const recognitionAccuracy = toPercent(totalRecognizedCorrect, totalFieldCount);
  const prefillRate = toPercent(totalPrefilled, totalFieldCount);
  const fieldFirstPassRate = toPercent(totalNoChange, totalFieldCount);
  const fieldChangeRate = toPercent(totalChanged, totalFieldCount);
  const fieldSupplementRate = toPercent(totalSupplemented, totalFieldCount);
  const fieldMissRecallRate = toPercent(totalMissRecalled, totalFieldCount);

  const qualityValues = [
    recognitionAccuracy,
    prefillRate,
    fieldFirstPassRate,
    fieldChangeRate,
    fieldSupplementRate,
    fieldMissRecallRate
  ];

  const quality = DATA_QUALITY_DATA.map((item, idx) => ({
    ...item,
    A: Math.max(0, Math.min(100, qualityValues[idx] ?? item.A))
  }));

  const submitToTransferRate = 0.9 + seededRandom(`${org}|${source}|submit_transfer`) * 0.06;
  const transferToCreateRate = 0.94 + seededRandom(`${org}|${source}|transfer_create`) * 0.04;
  const sourceToCreateRate = 0.84 + seededRandom(`${org}|${source}|source_create`) * 0.1;

  const submittedCount = workOrderSubmitVolume;
  const transferredCount = Math.max(submittedCount, Math.round(submittedCount / submitToTransferRate));
  const createdCount = Math.max(transferredCount, Math.round(transferredCount / transferToCreateRate));
  const sourceInputCount = Math.max(createdCount, Math.round(createdCount / sourceToCreateRate));
  const missedCount = Math.max(0, sourceInputCount - createdCount);

  const reasonWeightA = 0.4 + seededRandom(`${org}|${source}|reasonA`) * 0.15;
  const reasonWeightB = 0.25 + seededRandom(`${org}|${source}|reasonB`) * 0.15;

  const reasonValueA = Math.round(missedCount * reasonWeightA);
  const reasonValueB = Math.round(missedCount * reasonWeightB);
  const reasonValueC = Math.max(0, missedCount - reasonValueA - reasonValueB);

  const missedValues = [reasonValueA, reasonValueB, reasonValueC];
  const missed = MISSED_ORDER_REASONS.map((item, idx) => ({
    ...item,
    value: missedValues[idx] ?? 0
  }));

  const funnelValues = [sourceInputCount, createdCount, transferredCount, submittedCount];
  const funnel = CONVERSION_FUNNEL_DATA.map((item, idx) => ({
    ...item,
    value: funnelValues[idx] ?? item.value
  }));

  const sourceSplitSeed = seededRandom(`${org}|${startDate}|${endDate}|source_split`);
  const emailShare =
    source === 'email' ? 1 : source === 'file' ? 0 : 0.5 + sourceSplitSeed * 0.2;

  const emailFunnelValues = funnelValues.map((total) => Math.round(total * emailShare));
  const fileFunnelValues = funnelValues.map((total, idx) =>
    Math.max(0, total - (emailFunnelValues[idx] ?? 0))
  );

  const funnelBySource = CONVERSION_FUNNEL_DATA.map((item, idx) => ({
    ...item,
    value: funnelValues[idx] ?? item.value,
    emailValue: emailFunnelValues[idx] ?? 0,
    fileValue: fileFunnelValues[idx] ?? 0
  }));

  const currentKpiRaw = [
    workOrderSubmitVolume,
    avgProcessingDurationPerWorkOrder,
    recognitionAccuracy / 100,
    totalCalculatedCost
  ];

  let momByKpi: KpiMom[] = currentKpiRaw.map(() => ({ trend: 'neutral', percentage: '0.0%' }));

  if (!options.disableComparison) {
    const previousStartDate = addDaysUtc(startDate, -diffDays);
    const previousEndDate = addDaysUtc(startDate, -1);
    const previous = getDynamicData(
      previousStartDate,
      previousEndDate,
      org,
      source,
      csRate,
      opsRate,
      { disableComparison: true }
    );

    const previousKpiRaw = [
      previous.metrics.work_order_submit_volume,
      previous.metrics.avg_processing_duration_per_work_order,
      previous.metrics.recognition_accuracy,
      previous.metrics.total_labor_cost
    ];

    momByKpi = currentKpiRaw.map((current, idx) => calcMom(current, previousKpiRaw[idx] ?? 0));
  }

  const kpis = MOCK_KPI_DATA.map((kpi, idx) => {
    let value: string | number = kpi.value;

    if (idx === 0) {
      value = workOrderSubmitVolume.toLocaleString();
    } else if (idx === 1) {
      value = round1(avgProcessingDurationPerWorkOrder).toFixed(1);
    } else if (idx === 2) {
      value = recognitionAccuracy.toFixed(1);
    } else if (idx === 3) {
      value = `¥${(totalCalculatedCost / 1000).toFixed(1)}k`;
    }

    return {
      ...kpi,
      value,
      trend: momByKpi[idx]?.trend ?? 'neutral',
      percentage: momByKpi[idx]?.percentage ?? '0.0%',
      description: '较上周期'
    };
  });

  const maxDetailRows = Math.min(1200, workOrders.length);
  const tableData = workOrders.slice(0, maxDetailRows).map((order) => ({
    orderId: order.orderId,
    workOrderId: order.workOrderId,
    source: order.source,
    status: order.status,
    time: order.totalTime,
    accuracy: order.accuracy,
    user: order.user,
    reason: order.reason,
    proofreadingTime: order.proofreadingTime,
    auditTime: order.auditTime,
    totalTime: order.totalTime,
    auditor: order.auditor,
    reworkCount: order.reworkCount,
    preFillRate: order.preFillRate,
    firstPassRate: order.firstPassRate,
    fieldModRate: order.fieldModRate,
    fieldSuppRate: order.fieldSuppRate,
    falseRecallRate: order.falseRecallRate,
    proofreadingCost: order.proofreadingCost,
    auditCost: order.auditCost,
    processingCost: order.processingCost
  }));

  return {
    kpis,
    funnel,
    funnelBySource,
    missed,
    efficiency,
    quality,
    cost: costTrend,
    tableData,
    totalCSDays,
    totalOpsDays,
    totalCalculatedCost,
    metrics: {
      source_to_ticket_conversion_rate: sourceInputCount > 0 ? createdCount / sourceInputCount : 0,
      miss_rate: sourceInputCount > 0 ? (sourceInputCount - createdCount) / sourceInputCount : 0,
      avg_proofreading_duration_per_work_order: avgProofreadingDurationPerWorkOrder,
      avg_audit_duration_per_work_order: avgAuditDurationPerWorkOrder,
      avg_processing_duration_per_work_order: avgProcessingDurationPerWorkOrder,
      rework_rate: reworkRate,
      avg_submit_times_per_work_order: avgSubmitTimesPerWorkOrder,
      recognition_accuracy: recognitionAccuracy / 100,
      prefill_rate: prefillRate / 100,
      field_first_pass_rate: fieldFirstPassRate / 100,
      field_change_rate: fieldChangeRate / 100,
      field_supplement_rate: fieldSupplementRate / 100,
      field_missrecall_rate: fieldMissRecallRate / 100,
      work_order_submit_volume: workOrderSubmitVolume,
      avg_follower_cost_per_work_order: workOrderSubmitVolume > 0 ? (totalCSDays * csRate) / workOrderSubmitVolume : 0,
      total_follower_cost: totalCSDays * csRate,
      avg_reviewer_cost_per_work_order: workOrderSubmitVolume > 0 ? (totalOpsDays * opsRate) / workOrderSubmitVolume : 0,
      total_reviewer_cost: totalOpsDays * opsRate,
      avg_total_cost_per_work_order: workOrderSubmitVolume > 0 ? totalCalculatedCost / workOrderSubmitVolume : 0,
      total_labor_cost: totalCalculatedCost
    }
  };
};
