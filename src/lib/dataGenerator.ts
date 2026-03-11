import {
  MOCK_KPI_DATA,
  CONVERSION_FUNNEL_DATA,
  MISSED_ORDER_REASONS,
  DATA_QUALITY_DATA
} from '../constants/mockData';
import { getTenantProfile, type TenantDepartment } from './tenantProfiles';

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
  sourceId: string;
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
  fileRecognitionAccuracy: string;
  mailRecognitionAccuracy: string;
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

type OrgScope = 'all' | 'dept-followers' | 'dept-reviewers' | 'user-followers' | 'user-reviewers' | 'custom';

const includesName = (value: string, target: string, aliases: string[] = []) => {
  if (value === target) return true;
  return aliases.includes(value);
};

const resolveOrgScope = (
  org: string,
  followerDept: TenantDepartment | undefined,
  reviewerDept: TenantDepartment | undefined
): { scope: OrgScope; person?: string } => {
  const value = (org || '').trim();
  if (!value || value === 'all' || value === '全公司') {
    return { scope: 'all' };
  }

  if (followerDept && includesName(value, followerDept.name, followerDept.aliases || [])) {
    return { scope: 'dept-followers' };
  }

  if (reviewerDept && includesName(value, reviewerDept.name, reviewerDept.aliases || [])) {
    return { scope: 'dept-reviewers' };
  }

  if (followerDept?.members.includes(value)) {
    return { scope: 'user-followers', person: value };
  }

  if (reviewerDept?.members.includes(value)) {
    return { scope: 'user-reviewers', person: value };
  }

  return { scope: 'custom', person: value };
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
  tenantId: string = 'tenant-1001',
  options: GetDynamicDataOptions = {}
) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const tenantProfile = getTenantProfile(tenantId);
  const followerDept = tenantProfile.departments.find((item) => item.role === 'followers');
  const reviewerDept = tenantProfile.departments.find((item) => item.role === 'reviewers');
  const orgScopeInfo = resolveOrgScope(org, followerDept, reviewerDept);
  const tenantVolumeFactor = Math.max(0.6, tenantProfile.volumeFactor || 1);
  const tenantEmailBias = Math.max(-0.3, Math.min(0.3, tenantProfile.emailBias || 0));
  const tenantAccuracyBias = Math.max(-0.08, Math.min(0.08, tenantProfile.accuracyBias || 0));

  const roleUsers = {
    followers: followerDept?.members.length ? [...followerDept.members] : ['客服A', '客服B'],
    reviewers: reviewerDept?.members.length ? [...reviewerDept.members] : ['操作A', '操作B']
  };
  const allUsers = [...roleUsers.followers, ...roleUsers.reviewers];

  let peopleCount = 1;
  if (orgScopeInfo.scope === 'all') {
    peopleCount = Math.max(1, allUsers.length);
  } else if (orgScopeInfo.scope === 'dept-followers') {
    peopleCount = Math.max(1, roleUsers.followers.length);
  } else if (orgScopeInfo.scope === 'dept-reviewers') {
    peopleCount = Math.max(1, roleUsers.reviewers.length);
  }

  let sourceFactor = 1;
  if (source === 'email') sourceFactor = Math.max(0.2, 0.6 * (1 + tenantEmailBias));
  if (source === 'file') sourceFactor = Math.max(0.2, 0.4 * (1 - tenantEmailBias));
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
    Math.round(baseVolume * peopleCount * diffDays * sourceFactor * efficiencyFactor * tenantVolumeFactor)
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

  let userPool = [...allUsers];
  let auditorPool = [...allUsers];
  let specificFollower: string | null = null;
  let specificReviewer: string | null = null;

  if (orgScopeInfo.scope === 'dept-followers') {
    userPool = [...roleUsers.followers];
    auditorPool = [...allUsers];
  } else if (orgScopeInfo.scope === 'dept-reviewers') {
    userPool = [...allUsers];
    auditorPool = [...roleUsers.reviewers];
  } else if (orgScopeInfo.scope === 'user-followers') {
    specificFollower = orgScopeInfo.person || roleUsers.followers[0] || null;
    userPool = specificFollower ? [specificFollower] : [...roleUsers.followers];
    auditorPool = [...allUsers];
  } else if (orgScopeInfo.scope === 'user-reviewers') {
    specificReviewer = orgScopeInfo.person || roleUsers.reviewers[0] || null;
    userPool = [...allUsers];
    auditorPool = specificReviewer ? [specificReviewer] : [...roleUsers.reviewers];
  } else if (orgScopeInfo.scope === 'custom') {
    const normalized = (orgScopeInfo.person || '').trim() || '管理员';
    specificFollower = normalized;
    specificReviewer = normalized;
    userPool = [normalized];
    auditorPool = [normalized];
  }

  const reasons = ['接口超时', '文件解析失败', '无效委托'];

  let totalFieldCount = 0;
  let totalRecognizedCorrect = 0;
  let totalFileFieldCount = 0;
  let totalFileRecognizedCorrect = 0;
  let totalMailFieldCount = 0;
  let totalMailRecognizedCorrect = 0;
  let totalNoChange = 0;
  let totalChanged = 0;
  let totalSupplemented = 0;
  let totalMissRecalled = 0;

  const workOrders: WorkOrderRecord[] = Array.from({ length: targetWorkOrderCount }).map((_, i) => {
    const seed = `${tenantId}|${org}|${source}|${startDate}|${endDate}|${i}`;

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

    const resolvedUserPool = userPool.length > 0 ? userPool : [...allUsers];
    const resolvedAuditorPool = auditorPool.length > 0 ? auditorPool : [...allUsers];

    const user = specificFollower || resolvedUserPool[Math.floor(seededRandom(`${seed}|user`) * resolvedUserPool.length)];
    let auditor =
      specificReviewer || resolvedAuditorPool[Math.floor(seededRandom(`${seed}|auditor`) * resolvedAuditorPool.length)];

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
    const mailShareBase =
      sourceLabel === '邮件'
        ? 0.68 + seededRandom(`${seed}|mail_share_email_source`) * 0.2
        : sourceLabel === '文件'
          ? 0.18 + seededRandom(`${seed}|mail_share_file_source`) * 0.2
          : 0.45 + seededRandom(`${seed}|mail_share_mixed_source`) * 0.1;
    const mailFieldCount = Math.max(1, Math.min(fieldCount - 1, Math.round(fieldCount * mailShareBase)));
    const fileFieldCount = Math.max(1, fieldCount - mailFieldCount);

    const fileAccuracy = Math.max(
      0.75,
      Math.min(0.995, 0.9 + tenantAccuracyBias + seededRandom(`${seed}|recognized_file`) * 0.09)
    );
    const mailAccuracy = Math.max(
      0.75,
      Math.min(0.995, 0.9 + tenantAccuracyBias * 0.85 + seededRandom(`${seed}|recognized_mail`) * 0.09)
    );
    const fileRecognizedCorrect = Math.round(fileFieldCount * fileAccuracy);
    const mailRecognizedCorrect = Math.round(mailFieldCount * mailAccuracy);
    const recognizedCorrect = fileRecognizedCorrect + mailRecognizedCorrect;
    const initialNonEmptyCount = Math.round(fieldCount * (0.72 + seededRandom(`${seed}|initial_nonempty`) * 0.24));
    const emptyInitial = Math.max(0, fieldCount - initialNonEmptyCount);

    // 非空初始值 -> [一次通过(有值A->有值A), 修改(有值A->有值B), 误召回(有值->空)]
    let changed = Math.round(initialNonEmptyCount * (0.08 + seededRandom(`${seed}|changed_nonempty`) * 0.24));
    let missRecalled = Math.round(initialNonEmptyCount * (0.02 + seededRandom(`${seed}|miss_recall_nonempty`) * 0.1));
    if (changed + missRecalled > initialNonEmptyCount) {
      const scale = initialNonEmptyCount / (changed + missRecalled);
      changed = Math.round(changed * scale);
      missRecalled = Math.max(0, initialNonEmptyCount - changed);
    }
    const noChangeFromPrefilled = Math.max(0, initialNonEmptyCount - changed - missRecalled);

    // 空初始值 -> [补录(空->非空), 一次通过(空->空)]
    let supplemented = Math.round(emptyInitial * (0.35 + seededRandom(`${seed}|supplement_empty`) * 0.5));
    supplemented = Math.min(Math.max(0, supplemented), emptyInitial);
    const noChangeFromEmpty = Math.max(0, emptyInitial - supplemented);

    const noChange = noChangeFromPrefilled + noChangeFromEmpty;

    totalFieldCount += fieldCount;
    totalRecognizedCorrect += recognizedCorrect;
    totalFileFieldCount += fileFieldCount;
    totalFileRecognizedCorrect += fileRecognizedCorrect;
    totalMailFieldCount += mailFieldCount;
    totalMailRecognizedCorrect += mailRecognizedCorrect;
    totalNoChange += noChange;
    totalChanged += changed;
    totalSupplemented += supplemented;
    totalMissRecalled += missRecalled;

    const sourceId = toFiveDigitId(`${seed}|sid`, i * 23 + 7);
    const orderId = status === '失败' ? '' : toFiveDigitId(`${seed}|oid`, i * 17);
    const workOrderId = status === '失败' ? '' : toFiveDigitId(`${seed}|woid`, i * 23 + 7);
    const follower = status === '失败' ? '' : user;
    const reviewer = status === '失败' ? '' : auditor;

    return {
      orderId,
      workOrderId,
      sourceId,
      bucketIndex,
      source: sourceLabel,
      status,
      reason,
      user: follower,
      auditor: reviewer,
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
      fileRecognitionAccuracy: `${toPercent(fileRecognizedCorrect, fileFieldCount).toFixed(1)}%`,
      mailRecognitionAccuracy: `${toPercent(mailRecognizedCorrect, mailFieldCount).toFixed(1)}%`,
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
  const fileRecognitionAccuracy = toPercent(totalFileRecognizedCorrect, totalFileFieldCount);
  const mailRecognitionAccuracy = toPercent(totalMailRecognizedCorrect, totalMailFieldCount);
  const fieldFirstPassRate = toPercent(totalNoChange, totalFieldCount);
  const fieldChangeRate = toPercent(totalChanged, totalFieldCount);
  const fieldSupplementRate = toPercent(totalSupplemented, totalFieldCount);
  const fieldMissRecallRate = toPercent(totalMissRecalled, totalFieldCount);

  const qualityValues = [
    fileRecognitionAccuracy,
    mailRecognitionAccuracy,
    fieldFirstPassRate,
    100 - fieldChangeRate,
    100 - fieldSupplementRate,
    100 - fieldMissRecallRate
  ];

  const quality = DATA_QUALITY_DATA.map((item, idx) => ({
    ...item,
    A: Math.max(0, Math.min(100, qualityValues[idx] ?? item.A))
  }));

  const submitToTransferRate = 0.9 + seededRandom(`${tenantId}|${org}|${source}|submit_transfer`) * 0.06;
  const transferToCreateRate = 0.94 + seededRandom(`${tenantId}|${org}|${source}|transfer_create`) * 0.04;
  const sourceToCreateRate = 0.84 + seededRandom(`${tenantId}|${org}|${source}|source_create`) * 0.1;

  const submittedCount = workOrderSubmitVolume;
  const transferredCount = Math.max(submittedCount, Math.round(submittedCount / submitToTransferRate));
  const createdCount = Math.max(transferredCount, Math.round(transferredCount / transferToCreateRate));
  const sourceInputCount = Math.max(createdCount, Math.round(createdCount / sourceToCreateRate));
  const missedCount = Math.max(0, sourceInputCount - createdCount);

  const reasonWeightA = 0.4 + seededRandom(`${tenantId}|${org}|${source}|reasonA`) * 0.15;
  const reasonWeightB = 0.25 + seededRandom(`${tenantId}|${org}|${source}|reasonB`) * 0.15;

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

  const sourceSplitSeed = seededRandom(`${tenantId}|${org}|${startDate}|${endDate}|source_split`);
  const emailShare =
    source === 'email'
      ? 1
      : source === 'file'
        ? 0
        : Math.max(0.2, Math.min(0.8, 0.5 + sourceSplitSeed * 0.2 + tenantEmailBias * 0.25));

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
    fieldFirstPassRate / 100,
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
      tenantId,
      { disableComparison: true }
    );

    const previousKpiRaw = [
      previous.metrics.work_order_submit_volume,
      previous.metrics.avg_processing_duration_per_work_order,
      previous.metrics.field_first_pass_rate,
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
      value = fieldFirstPassRate.toFixed(1);
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
    sourceId: order.sourceId,
    source: order.source,
    status: order.status,
    time: order.totalTime,
    fileRecognitionAccuracy: order.fileRecognitionAccuracy,
    mailRecognitionAccuracy: order.mailRecognitionAccuracy,
    user: order.user,
    reason: order.reason,
    proofreadingTime: order.proofreadingTime,
    auditTime: order.auditTime,
    totalTime: order.totalTime,
    auditor: order.auditor,
    reworkCount: order.reworkCount,
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
      file_recognition_accuracy: fileRecognitionAccuracy / 100,
      mail_recognition_accuracy: mailRecognitionAccuracy / 100,
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
