<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Document, Download, Filter, Operation, Search, View } from '@element-plus/icons-vue';
import type { EChartsOption } from 'echarts';
import * as XLSX from 'xlsx';
import { getDynamicData } from './lib/dataGenerator';
import { exportDashboardWorkbook } from './lib/exportWorkbook';
import { TENANT_OPTIONS, type OrgTreeNode } from './lib/tenantProfiles';
import EChart from './components/charts/EChart.vue';

type SourceFilter = 'all' | 'email' | 'file';
type AnalysisView = 'workorder' | 'efficiency';
type TabName = 'conversion' | 'quality' | 'cost';
type TrendType = 'up' | 'down' | 'neutral';
type EfficiencyFocus = 'processing-count' | 'processing-duration' | 'labor-cost';
type TableStateKey = TabName | 'efficiencyCost';

type WorkOrderRow = {
  orderId: string;
  workOrderId: string;
  sourceId: string;
  createdAt: string;
  endedAt: string;
  source: string;
  sourceKey: 'email' | 'file' | 'unknown';
  status: string;
  reason: string;
  user: string;
  auditor: string;
  totalTime: string;
  proofreadingTime: string;
  auditTime: string;
  reworkCount: number;
  fileRecognitionAccuracy: string;
  mailRecognitionAccuracy: string;
  firstPassRate: string;
  fieldModRate: string;
  fieldSuppRate: string;
  falseRecallRate: string;
  proofreadingCost: string;
  auditCost: string;
  processingCost: string;
};

type EfficiencyPersonRow = {
  person: string;
  department: string;
  processingCount: number;
  avgProcessingMinutes: number;
  avgProofreadingMinutes: number;
  avgAuditMinutes: number;
  totalProcessingMinutes: number;
  processingCostValue: number;
  reworkCount: number;
};

type EfficiencyPersonCostBarDatum = {
  value: number;
  person: string;
  department: string;
  processingCount: number;
  avgProcessingMinutes: number;
  processingCost: number;
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    shadowBlur?: number;
    shadowColor?: string;
  };
};

type TableState = {
  keyword: string;
  page: number;
  pageSize: number;
};

type PreviewFile = {
  name: string;
  kind: '附件' | '文件';
  sizeLabel: string;
  blob: Blob;
  tableRows: Array<{ c1: string; c2: string; c3: string; c4: string }>;
};

type FlowRecord = {
  time: string;
  person: string;
  stage: string;
  action: string;
};

type FieldDetail = {
  field: string;
  source: '托书' | '历史单' | 'BC' | '邮件' | '默认值' | '-';
  rawValue: string;
  cleanedValue: string;
  submittedValue: string;
};

type FieldRecognitionRow = {
  field: string;
  idpAccuracy: string;
  mailAccuracy: string;
};

const tabList: Array<{ name: TabName; label: string }> = [
  { name: 'conversion', label: '转化分析' },
  { name: 'quality', label: '数据质量分析' },
  { name: 'cost', label: '效率成本分析' }
];

const analysisViewOptions: Array<{ value: AnalysisView; label: string }> = [
  { value: 'workorder', label: '工作单维度' },
  { value: 'efficiency', label: '人效维度' }
];

const sourceOptions = [
  { label: '全部来源', value: 'all' as SourceFilter },
  { label: '邮件接单', value: 'email' as SourceFilter },
  { label: '文件接单', value: 'file' as SourceFilter }
];

const fixedTenantId = TENANT_OPTIONS[0]?.id || 'tenant-1001';
const allCompanyNode = TENANT_OPTIONS[0]?.orgTree?.[0] || { value: '全公司', label: '全公司' };
const companyOrgTree = TENANT_OPTIONS[0]?.orgTree || [allCompanyNode];

const dateShortcuts = [
  {
    text: '最近7天',
    value: () => {
      const end = new Date('2026-03-02');
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      return [start, end];
    }
  },
  {
    text: '最近1个月',
    value: () => {
      const end = new Date('2026-03-02');
      const start = new Date(end);
      start.setMonth(end.getMonth() - 1);
      return [start, end];
    }
  },
  {
    text: '最近3个月',
    value: () => {
      const end = new Date('2026-03-02');
      const start = new Date(end);
      start.setMonth(end.getMonth() - 3);
      return [start, end];
    }
  },
  {
    text: '最近一年',
    value: () => {
      const end = new Date('2026-03-02');
      const start = new Date(end);
      start.setFullYear(end.getFullYear() - 1);
      return [start, end];
    }
  }
];

const sourceLabelMap: Record<SourceFilter, string> = {
  all: '全部来源',
  email: '邮件接单',
  file: '文件接单'
};

const textMap: Record<string, string> = {
  '鍏ㄥ叕鍙?': '全公司',
  '鍑哄彛涓氬姟閮?': '出口业务部',
  '璁㈣埍鎿嶄綔閮?': '订舱操作部',
  '寮犱笁': '张三',
  '鏉庡洓': '李四',
  '鐜嬩簲': '王五',
  '璧靛叚': '赵六',
  '绠＄悊鍛?': '管理员',
  '閭欢': '邮件',
  '鏂囦欢': '文件',
  Success: '成功',
  Failed: '失败',
  'API Timeout': '接口超时',
  'Invalid Request': '无效委托',
  'File Parse Error': '文件解析失败'
};

const qualityFields = [
  '发货人',
  '收货人',
  '通知人',
  '驳船ETD',
  '船名',
  '航次',
  'ETD',
  '约号',
  'NAC',
  '收货地',
  '大船起运港',
  '卸货港',
  '交货地',
  '货物类型',
  '唛头',
  '货描',
  '英文品名',
  '中文品名',
  'HSCODE',
  '总件数',
  '包装类型',
  '毛重',
  '体积',
  '箱型箱量',
  '出单方式',
  '订舱备注',
  '运输条款',
  '付款方式',
  '付款地',
  '委托客户',
  '工作单号',
  '三方单号',
  '客户业务编号',
  '审单备注'
];

const fieldRecognitionFields = [
  '船公司',
  '船名',
  '航次',
  'ETD',
  '约号',
  '收货地',
  '大船起运港',
  '卸货港',
  '交货地',
  '英文品名',
  '中文品名',
  'HSCODE',
  '委托客户',
  '工作单号',
  '订舱备注',
  '运输条款'
];

const fieldSourceOptions: FieldDetail['source'][] = ['托书', '历史单', 'BC', '邮件', '默认值', '-'];

const fieldMockValueMap: Record<string, string> = {
  发货人: 'HUBEI SHENLI FORGING CO., LTD.',
  收货人: 'UD TRUCKS CORPORATION (THAILAND) CO., LTD.',
  通知人: 'TBMP LIMITED',
  船名: 'EVER ALPHA',
  航次: 'EAV123W',
  ETD: '2026-03-12',
  约号: 'BK20260312001',
  NAC: 'NAC-TH-2026',
  收货地: 'WUHAN',
  大船起运港: 'SHANGHAI',
  卸货港: 'LAEM CHABANG',
  交货地: 'BANGKOK',
  货物类型: '汽车零部件',
  英文品名: 'FRONT AXLE BEAM',
  中文品名: '前轴梁',
  HSCODE: '8708999990',
  总件数: '14',
  包装类型: 'PALLET',
  毛重: '15820KG',
  体积: '17.4CBM',
  箱型箱量: '1*40HQ',
  运输条款: 'FOB',
  付款方式: '月结',
  付款地: '上海'
};

const filters = reactive({
  org: allCompanyNode.value,
  source: 'all' as SourceFilter
});

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);

const DASHBOARD_DESIGN_WIDTH = 1760;
const PAGE_MIN_SCALE = 0.82;
const pageScale = computed(() => {
  const fitScale = (viewportWidth.value - 8) / DASHBOARD_DESIGN_WIDTH;
  return Math.max(PAGE_MIN_SCALE, Math.min(1, fitScale));
});

const pageScaleStyle = computed(() => ({
  '--page-scale': String(pageScale.value),
  '--design-width': `${DASHBOARD_DESIGN_WIDTH}px`
}));

const chartHeight = (base: number) => `${base}px`;

const sourceSwitchIndex = computed(() => {
  const index = sourceOptions.findIndex((item) => item.value === filters.source);
  return index >= 0 ? index : 0;
});

const analysisSwitchIndex = computed(() => {
  const index = analysisViewOptions.findIndex((item) => item.value === activeAnalysisView.value);
  return index >= 0 ? index : 0;
});

const fullOrgTree = computed<OrgTreeNode[]>(() => companyOrgTree);
const efficiencyOrgTree = computed<OrgTreeNode[]>(() =>
  fullOrgTree.value.filter((node) => node.value !== allCompanyNode.value)
);

const orgTree = computed<OrgTreeNode[]>(() => {
  if (activeAnalysisView.value === 'efficiency') {
    return efficiencyOrgTree.value;
  }

  return [
    {
      value: allCompanyNode.value,
      label: allCompanyNode.label
    }
  ];
});

const isOrgPathValid = (path: string[], tree: OrgTreeNode[]) => {
  if (!Array.isArray(path) || path.length === 0) return false;
  let currentList = tree;
  for (const segment of path) {
    const current = currentList.find((node) => node.value === segment);
    if (!current) return false;
    currentList = current.children || [];
  }
  return true;
};

const orgPath = ref<string[]>([allCompanyNode.value]);
const orgProps = {
  checkStrictly: true,
  emitPath: true
};

const orgSelectorPlaceholder = computed(() => (activeAnalysisView.value === 'workorder' ? '公司' : '部门/个人'));
const getOrgTreeByView = (view: AnalysisView) =>
  view === 'workorder'
    ? [
        {
          value: allCompanyNode.value,
          label: allCompanyNode.label
        }
      ]
    : efficiencyOrgTree.value;
const getDefaultOrgPath = (view: AnalysisView) => {
  if (view === 'workorder') return [allCompanyNode.value];
  const firstDept = efficiencyOrgTree.value[0];
  return firstDept ? [firstDept.value] : [allCompanyNode.value];
};
const isOrgPathAllowedForView = (path: string[], view: AnalysisView) => {
  if (!isOrgPathValid(path, getOrgTreeByView(view))) return false;
  if (view === 'efficiency' && path[0] === allCompanyNode.value) return false;
  return true;
};
const applyOrgPathForView = (view: AnalysisView, path?: string[]) => {
  const nextPath = path && isOrgPathAllowedForView(path, view) ? [...path] : getDefaultOrgPath(view);
  orgPath.value = nextPath;
  filters.org = nextPath[nextPath.length - 1] || getDefaultOrgPath(view)[0] || allCompanyNode.value;
};

const TOP_FILTER_STORAGE_KEY = 'yxd-bi-top-filters-v2';

type PersistedTopFilters = {
  dateRange?: [string, string];
  orgPath?: string[];
  source?: SourceFilter;
  analysisView?: AnalysisView;
  activeTab?: TabName;
  csRate?: number;
  opsRate?: number;
  originalProofreadingMinutes?: number;
  originalAuditMinutes?: number;
};

const readPersistedTopFilters = (): PersistedTopFilters | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TOP_FILTER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedTopFilters;
  } catch {
    return null;
  }
};

const initialPersistedTopFilters = readPersistedTopFilters();
const initialAnalysisView: AnalysisView =
  initialPersistedTopFilters?.analysisView === 'efficiency' ? 'efficiency' : 'workorder';
const initialActiveTab: TabName =
  initialPersistedTopFilters?.activeTab === 'quality' || initialPersistedTopFilters?.activeTab === 'cost'
    ? initialPersistedTopFilters.activeTab
    : 'conversion';

const dateRange = ref<[string, string]>(['2025-12-02', '2026-03-02']);
const csRate = ref(200);
const opsRate = ref(300);
const originalProofreadingMinutes = ref(10);
const originalAuditMinutes = ref(5);
const exporting = ref(false);
const activeAnalysisView = ref<AnalysisView>(initialAnalysisView);
const activeTab = ref<TabName>(initialActiveTab);
const lastWorkOrderTab = ref<TabName>('conversion');
const activeEfficiencyFocus = ref<EfficiencyFocus>('processing-count');
const isSwitching = ref(false);
let switchingTimer: number | null = null;

const isDateText = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isSourceFilter = (value: unknown): value is SourceFilter => value === 'all' || value === 'email' || value === 'file';
const isAnalysisView = (value: unknown): value is AnalysisView => value === 'workorder' || value === 'efficiency';
const isTabName = (value: unknown): value is TabName => value === 'conversion' || value === 'quality' || value === 'cost';
const isNonNegativeFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const restoreTopFilters = () => {
  const parsed = readPersistedTopFilters();
  if (!parsed) return;

  if (
    Array.isArray(parsed.dateRange) &&
    parsed.dateRange.length === 2 &&
    isDateText(parsed.dateRange[0]) &&
    isDateText(parsed.dateRange[1])
  ) {
    dateRange.value = [parsed.dateRange[0], parsed.dateRange[1]];
  }

  if (isSourceFilter(parsed.source)) {
    filters.source = parsed.source;
  }

  if (isAnalysisView(parsed.analysisView)) {
    activeAnalysisView.value = parsed.analysisView;
  }

  if (isTabName(parsed.activeTab)) {
    activeTab.value = parsed.activeTab;
  }

  if (isNonNegativeFiniteNumber(parsed.csRate)) {
    csRate.value = parsed.csRate;
  }

  if (isNonNegativeFiniteNumber(parsed.opsRate)) {
    opsRate.value = parsed.opsRate;
  }

  if (isNonNegativeFiniteNumber(parsed.originalProofreadingMinutes)) {
    originalProofreadingMinutes.value = parsed.originalProofreadingMinutes;
  }

  if (isNonNegativeFiniteNumber(parsed.originalAuditMinutes)) {
    originalAuditMinutes.value = parsed.originalAuditMinutes;
  }

  const persistedOrgPath =
    Array.isArray(parsed.orgPath) &&
    parsed.orgPath.length > 0 &&
    parsed.orgPath.every((item) => typeof item === 'string' && item.trim().length > 0)
      ? parsed.orgPath
      : undefined;
  applyOrgPathForView(activeAnalysisView.value, persistedOrgPath);
};

const persistTopFilters = () => {
  if (typeof window === 'undefined') return;
  const payload: PersistedTopFilters = {
    dateRange: [dateRange.value?.[0] || '2025-12-02', dateRange.value?.[1] || '2026-03-02'],
    orgPath: orgPath.value.length ? [...orgPath.value] : [allCompanyNode.value],
    source: filters.source,
    analysisView: activeAnalysisView.value,
    activeTab: activeTab.value,
    csRate: csRate.value,
    opsRate: opsRate.value,
    originalProofreadingMinutes: originalProofreadingMinutes.value,
    originalAuditMinutes: originalAuditMinutes.value
  };
  try {
    window.localStorage.setItem(TOP_FILTER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
};

restoreTopFilters();

const triggerSwitching = () => {
  if (switchingTimer !== null) {
    window.clearTimeout(switchingTimer);
    switchingTimer = null;
  }
  isSwitching.value = true;
  switchingTimer = window.setTimeout(() => {
    isSwitching.value = false;
    switchingTimer = null;
  }, 280);
};

const startDate = computed(() => dateRange.value?.[0] || '2025-12-02');
const endDate = computed(() => dateRange.value?.[1] || startDate.value);

const dashboardData = computed(() =>
  getDynamicData(
    startDate.value,
    endDate.value,
    filters.org,
    filters.source,
    csRate.value,
    opsRate.value,
    fixedTenantId
  )
);

const normalizeText = (value: unknown) => {
  const text = String(value ?? '-');
  return textMap[text] ?? text;
};

const normalizeId = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '-';
  return digits.slice(-5).padStart(5, '0');
};

const sourceToKey = (value: unknown): WorkOrderRow['sourceKey'] => {
  const text = normalizeText(value).toLowerCase();
  if (text.includes('邮件') || text.includes('email')) return 'email';
  if (text.includes('文件') || text.includes('file')) return 'file';
  return 'unknown';
};

const normalizeSource = (value: unknown) => {
  const key = sourceToKey(value);
  if (key === 'email') return '邮件';
  if (key === 'file') return '文件';
  return normalizeText(value);
};

const normalizeStatus = (value: unknown) => {
  const text = normalizeText(value);
  if (text.includes('成功')) return '成功';
  if (text.includes('失败')) return '失败';
  return text;
};

const toRow = (item: Record<string, unknown>): WorkOrderRow => ({
  orderId: normalizeId(item.orderId),
  workOrderId: normalizeId(item.workOrderId),
  sourceId: normalizeId(item.sourceId ?? item.workOrderId),
  createdAt: normalizeText(item.createdAt ?? '-'),
  endedAt: normalizeText(item.endedAt ?? '-'),
  source: normalizeSource(item.source),
  sourceKey: sourceToKey(item.source),
  status: normalizeStatus(item.status),
  reason: normalizeText(item.reason ?? '-'),
  user: normalizeText(item.user),
  auditor: normalizeText(item.auditor),
  totalTime: String(item.totalTime ?? '-'),
  proofreadingTime: String(item.proofreadingTime ?? '-'),
  auditTime: String(item.auditTime ?? '-'),
  reworkCount: Number(item.reworkCount ?? 0),
  fileRecognitionAccuracy: String(item.fileRecognitionAccuracy ?? item.fileRecognition ?? '-'),
  mailRecognitionAccuracy: String(item.mailRecognitionAccuracy ?? item.mailRecognition ?? '-'),
  firstPassRate: String(item.firstPassRate ?? '-'),
  fieldModRate: String(item.fieldModRate ?? '-'),
  fieldSuppRate: String(item.fieldSuppRate ?? '-'),
  falseRecallRate: String(item.falseRecallRate ?? '-'),
  proofreadingCost: String(item.proofreadingCost ?? '-'),
  auditCost: String(item.auditCost ?? '-'),
  processingCost: String(item.processingCost ?? '-')
});

const allRows = computed<WorkOrderRow[]>(() =>
  (dashboardData.value.tableData || []).map((item) => toRow(item as Record<string, unknown>))
);

const personRows = computed<EfficiencyPersonRow[]>(() =>
  ((dashboardData.value.personTableData || []) as Array<Record<string, unknown>>).map((item) => ({
    person: normalizeText(item.person ?? '-'),
    department: normalizeText(item.department ?? '-'),
    processingCount: Number(item.processingCount ?? 0),
    avgProcessingMinutes: Number(item.avgProcessingMinutes ?? 0),
    avgProofreadingMinutes: Number(item.avgProofreadingMinutes ?? 0),
    avgAuditMinutes: Number(item.avgAuditMinutes ?? 0),
    totalProcessingMinutes: Number(item.totalProcessingMinutes ?? 0),
    processingCostValue: Number(item.processingCostValue ?? 0),
    reworkCount: Number(item.reworkCount ?? 0)
  }))
);

const workOrderModuleRows = computed<WorkOrderRow[]>(() => {
  if (activeTab.value === 'conversion') return allRows.value;
  return allRows.value
    .filter((row) => row.status.includes('成功') && row.orderId !== '-' && row.workOrderId !== '-')
    .sort((left, right) => {
      const endedAtDiff = parseDateTimeText(right.endedAt) - parseDateTimeText(left.endedAt);
      if (endedAtDiff !== 0) return endedAtDiff;
      return parseDateTimeText(right.createdAt) - parseDateTimeText(left.createdAt);
    });
});

const availableTabs = computed<TabName[]>(() =>
  activeAnalysisView.value === 'efficiency' ? ['cost'] : tabList.map((item) => item.name)
);

const currentTableStateKey = computed<TableStateKey>(() =>
  activeAnalysisView.value === 'efficiency' ? 'efficiencyCost' : activeTab.value
);

const detailRows = computed<Array<WorkOrderRow | EfficiencyPersonRow>>(() =>
  activeAnalysisView.value === 'efficiency' ? personRows.value : workOrderModuleRows.value
);

const tableStates = reactive<Record<TableStateKey, TableState>>({
  conversion: { keyword: '', page: 1, pageSize: 20 },
  quality: { keyword: '', page: 1, pageSize: 20 },
  cost: { keyword: '', page: 1, pageSize: 20 },
  efficiencyCost: { keyword: '', page: 1, pageSize: 20 }
});

const pageSizes = [10, 20, 50, 100];

for (const tab of ['conversion', 'quality', 'cost', 'efficiencyCost'] as TableStateKey[]) {
  watch(
    () => [tableStates[tab].keyword, tableStates[tab].pageSize],
    () => {
      tableStates[tab].page = 1;
    }
  );
}

const normalizeSearchText = (value: string) =>
  value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/工单ID|工作单ID|来源ID|工单|工作单|order|work|source|id|人员|部门|组织|：|:/gi, ' ')
    .trim()
    .toLowerCase();

const currentTableState = computed(() => tableStates[currentTableStateKey.value]);

const currentKeyword = computed({
  get: () => currentTableState.value.keyword,
  set: (value: string) => {
    tableStates[currentTableStateKey.value].keyword = value;
  }
});

const filteredRows = computed(() => {
  const query = normalizeSearchText(currentTableState.value.keyword);
  if (!query) return detailRows.value;
  const tokens = query.split(/[\s,，;；]+/).filter(Boolean);
  if (tokens.length === 0) return detailRows.value;

  if (activeAnalysisView.value === 'efficiency') {
    return personRows.value.filter((row) =>
      tokens.some(
        (token) =>
          row.person.toLowerCase().includes(token) ||
          row.department.toLowerCase().includes(token)
      )
    );
  }

  return workOrderModuleRows.value.filter((row) =>
    tokens.some(
      (token) =>
        row.orderId.toLowerCase().includes(token) ||
        row.workOrderId.toLowerCase().includes(token) ||
        row.sourceId.toLowerCase().includes(token)
    )
  );
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / currentTableState.value.pageSize)));

watch([filteredRows, totalPages], () => {
  if (currentTableState.value.page > totalPages.value) {
    currentTableState.value.page = totalPages.value;
  }
});

const pagedRows = computed(() => {
  const start = (currentTableState.value.page - 1) * currentTableState.value.pageSize;
  return filteredRows.value.slice(start, start + currentTableState.value.pageSize);
});

const updateCurrentPage = (page: number) => {
  tableStates[currentTableStateKey.value].page = page;
};

const updateCurrentPageSize = (size: number) => {
  tableStates[currentTableStateKey.value].pageSize = size;
};

const metrics = computed(() => dashboardData.value.metrics || {});
const toPercent = (value: number | undefined, digits = 1) => `${((value || 0) * 100).toFixed(digits)}%`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDateText = (value: string) => {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const parseDateTimeText = (value: string) => {
  const text = String(value || '').trim();
  if (!text || text === '-') return 0;
  const timestamp = Date.parse(text.replace(/\./g, '-'));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatDateText = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateText = (value: string, days: number) => {
  const date = parseDateText(value);
  date.setDate(date.getDate() + days);
  return formatDateText(date);
};

const calcMom = (current: number, previous: number): { trend: TrendType; percentage: string } => {
  const epsilon = 1e-9;
  const delta = current - previous;
  const trend: TrendType = delta > epsilon ? 'up' : delta < -epsilon ? 'down' : 'neutral';
  let ratio = 0;
  if (Math.abs(previous) <= epsilon) {
    ratio = Math.abs(current) <= epsilon ? 0 : 1;
  } else {
    ratio = delta / Math.abs(previous);
  }
  return {
    trend,
    percentage: `${(Math.abs(ratio) * 100).toFixed(1)}%`
  };
};

const calcSavedCostByMetrics = (m: Record<string, number | undefined>) => {
  const workOrderVolume = Number(m.work_order_submit_volume || 0);
  const avgProofreadingMinutes = Number(m.avg_proofreading_duration_per_work_order || 0);
  const avgAuditMinutes = Number(m.avg_audit_duration_per_work_order || 0);

  const savedProofreadingMinutesPerOrder = originalProofreadingMinutes.value - avgProofreadingMinutes;
  const savedAuditMinutesPerOrder = originalAuditMinutes.value - avgAuditMinutes;

  const followerSavedCost = (savedProofreadingMinutesPerOrder * workOrderVolume * csRate.value) / 480;
  const reviewerSavedCost = (savedAuditMinutesPerOrder * workOrderVolume * opsRate.value) / 480;

  return followerSavedCost + reviewerSavedCost;
};

const totalSavedCost = computed(() => calcSavedCostByMetrics(metrics.value));

const previousDashboardData = computed(() => {
  const start = parseDateText(startDate.value);
  const end = parseDateText(endDate.value);
  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  const previousStart = shiftDateText(startDate.value, -periodDays);
  const previousEnd = shiftDateText(startDate.value, -1);
  return getDynamicData(previousStart, previousEnd, filters.org, filters.source, csRate.value, opsRate.value, fixedTenantId, {
    disableComparison: true
  });
});

const previousMetrics = computed(() => previousDashboardData.value.metrics || {});

const savedCostMom = computed(() => {
  const previousSavedCost = calcSavedCostByMetrics(previousMetrics.value as Record<string, number | undefined>);
  return calcMom(totalSavedCost.value, previousSavedCost);
});

const fieldFirstPassRate = computed(() => Number(metrics.value.field_first_pass_rate || 0));
const fieldFirstPassRateMom = computed(() =>
  calcMom(fieldFirstPassRate.value, Number(previousMetrics.value.field_first_pass_rate || 0))
);
const efficiencyProcessingCount = computed(() => Number(metrics.value.work_order_submit_volume || 0));
const efficiencyProcessingCountMom = computed(() =>
  calcMom(
    efficiencyProcessingCount.value,
    Number(previousMetrics.value.work_order_submit_volume || 0)
  )
);
const avgEfficiencyLaborCost = computed(() => Number(metrics.value.avg_efficiency_labor_cost_per_person || 0));
const avgEfficiencyLaborCostMom = computed(() =>
  calcMom(avgEfficiencyLaborCost.value, Number(previousMetrics.value.avg_efficiency_labor_cost_per_person || 0))
);
const avgEfficiencyInputMinutes = computed(() => Number(metrics.value.avg_efficiency_input_duration_per_person || 0));
const avgEfficiencyInputMinutesMom = computed(() =>
  calcMom(
    avgEfficiencyInputMinutes.value,
    Number(previousMetrics.value.avg_efficiency_input_duration_per_person || 0)
  )
);

const kpis = computed(() => {
  if (activeAnalysisView.value === 'efficiency') {
    return [
      {
        label: '处理单量',
        value: efficiencyProcessingCount.value.toLocaleString(),
        trend: efficiencyProcessingCountMom.value.trend,
        mom: efficiencyProcessingCountMom.value.percentage,
        tab: 'cost' as TabName,
        focus: 'processing-count' as EfficiencyFocus
      },
      {
        label: '平均投入时长',
        value: `${avgEfficiencyInputMinutes.value.toFixed(1)}min`,
        trend: avgEfficiencyInputMinutesMom.value.trend,
        mom: avgEfficiencyInputMinutesMom.value.percentage,
        tab: 'cost' as TabName,
        focus: 'processing-duration' as EfficiencyFocus
      },
      {
        label: '平均人力成本',
        value: `¥${avgEfficiencyLaborCost.value.toFixed(1)}`,
        trend: avgEfficiencyLaborCostMom.value.trend,
        mom: avgEfficiencyLaborCostMom.value.percentage,
        tab: 'cost' as TabName,
        focus: 'labor-cost' as EfficiencyFocus
      }
    ];
  }

  return [
    {
      label: '工作单提交量',
      value: Number(metrics.value.work_order_submit_volume || 0).toLocaleString(),
      trend: calcMom(
        Number(metrics.value.work_order_submit_volume || 0),
        Number(previousMetrics.value.work_order_submit_volume || 0)
      ).trend,
      mom: calcMom(
        Number(metrics.value.work_order_submit_volume || 0),
        Number(previousMetrics.value.work_order_submit_volume || 0)
      ).percentage,
      tab: 'conversion' as TabName
    },
    {
      label: '字段一次通过率',
      value: toPercent(fieldFirstPassRate.value),
      trend: fieldFirstPassRateMom.value.trend,
      mom: fieldFirstPassRateMom.value.percentage,
      tab: 'quality' as TabName
    },
    {
      label: '节省总成本',
      value: `¥${totalSavedCost.value.toFixed(1)}`,
      trend: savedCostMom.value.trend,
      mom: savedCostMom.value.percentage,
      tab: 'cost' as TabName
    }
  ];
});

const kpiColSpan = computed(() => {
  const length = Math.max(1, kpis.value.length);
  return Math.floor(24 / length);
});
const trendType = (trend: TrendType) => (trend === 'up' ? 'success' : trend === 'down' ? 'danger' : 'info');
const trendLabel = (trend: TrendType) => (trend === 'up' ? '上升' : trend === 'down' ? '下降' : '持平');

const funnelStageLabels = ['来源输入', '成功创建工单', '工作单', '成功提交委托'];
const missReasonLabels = ['接口超时', '文件解析失败'];
const missReasonColors = ['#ef4444', '#6366f1'];

const funnelRows = computed(() => {
  const base = dashboardData.value.funnel || [];
  const split = dashboardData.value.funnelBySource || [];

  return base.map((item, idx) => {
    const total = Number(item?.value ?? 0);
    let email = Number(split[idx]?.emailValue ?? 0);
    let file = Number(split[idx]?.fileValue ?? 0);

    if (filters.source === 'email') {
      email = total;
      file = 0;
    } else if (filters.source === 'file') {
      email = 0;
      file = total;
    } else if (email + file === 0 && total > 0) {
      email = Math.round(total * 0.6);
      file = total - email;
    }

    return {
      name: funnelStageLabels[idx] || normalizeText(item?.name ?? '-'),
      total,
      email,
      file
    };
  });
});

const missReasons = computed(() => {
  const list = (dashboardData.value.missed || []).map((item, idx) => ({
    name: missReasonLabels[idx] || normalizeText(item?.name ?? '-'),
    value: Number(item?.value ?? 0)
  }));

  const total = list.reduce((sum, item) => sum + item.value, 0);

  return list.map((item) => ({
    ...item,
    ratio: total > 0 ? item.value / total : 0
  }));
});

const missRateText = computed(() => toPercent(metrics.value.miss_rate));

const efficiencyRows = computed(() =>
  (dashboardData.value.efficiency || []).map((item) => ({
    name: item.tickLabel || item.name,
    proofreadingTime: Number(item.proofreadingTime || 0),
    auditTime: Number(item.auditTime || 0),
    totalTime: Number(item.totalTime || 0),
    submissions: Number(item.submissions || 0),
    rejections: Number(item.rejections || 0),
    reworkRate: Number(item.reworkRate || 0)
  }))
);

const conversionTimelineRows = computed(() => {
  const sourceInputTotal = funnelRows.value[0]?.total || 0;
  const createdTotal = funnelRows.value[1]?.total || 0;
  const transferredTotal = funnelRows.value[2]?.total || 0;
  const submittedTotal = funnelRows.value[3]?.total || 0;

  const transferPerSubmit = submittedTotal > 0 ? transferredTotal / submittedTotal : 1;
  const createPerTransfer = transferredTotal > 0 ? createdTotal / transferredTotal : 1;
  const sourcePerCreate = createdTotal > 0 ? sourceInputTotal / createdTotal : 1;

  const stageEmailShare = [0, 1, 2, 3].map((idx) => {
    const stage = funnelRows.value[idx];
    if (!stage || stage.total <= 0) {
      if (filters.source === 'email') return 1;
      if (filters.source === 'file') return 0;
      return 0.5;
    }
    return Math.max(0, Math.min(1, stage.email / stage.total));
  });

  return efficiencyRows.value.map((row) => {
    const submitted = Math.max(0, Number(row.submissions || 0));
    const transferred = Math.max(submitted, Math.round(submitted * transferPerSubmit));
    const created = Math.max(transferred, Math.round(transferred * createPerTransfer));
    const sourceInput = Math.max(created, Math.round(created * sourcePerCreate));

    const totals = [sourceInput, created, transferred, submitted];
    const emailValues = totals.map((total, idx) => {
      if (filters.source === 'email') return total;
      if (filters.source === 'file') return 0;
      return Math.round(total * stageEmailShare[idx]);
    });
    const fileValues = totals.map((total, idx) => {
      if (filters.source === 'file') return total;
      if (filters.source === 'email') return 0;
      return Math.max(0, total - emailValues[idx]);
    });

    return {
      name: row.name,
      sourceInput: totals[0],
      created: totals[1],
      transferred: totals[2],
      submitted: totals[3],
      sourceInputEmail: emailValues[0],
      createdEmail: emailValues[1],
      transferredEmail: emailValues[2],
      submittedEmail: emailValues[3],
      sourceInputFile: fileValues[0],
      createdFile: fileValues[1],
      transferredFile: fileValues[2],
      submittedFile: fileValues[3]
    };
  });
});

const conversionStageTotals = computed(() =>
  funnelStageLabels.map((label, idx) => ({
    name: label,
    total: Number(funnelRows.value[idx]?.total ?? 0)
  }))
);

const toQualityPercent = (ratio: number | undefined) => {
  const value = Number(ratio || 0) * 100;
  return Math.max(0, Math.min(100, value));
};

const qualityDimensionRows = computed(() => {
  const m = metrics.value;
  return [
    {
      label: '文件识别准确率',
      value: toQualityPercent(m.file_recognition_accuracy ?? m.recognition_accuracy)
    },
    {
      label: '邮件识别准确率',
      value: toQualityPercent(m.mail_recognition_accuracy ?? m.recognition_accuracy)
    },
    {
      label: '字段一次通过率',
      value: toQualityPercent(m.field_first_pass_rate)
    },
    {
      label: '字段未修改率',
      value: toQualityPercent(1 - Number(m.field_change_rate || 0))
    },
    {
      label: '字段无需补录率',
      value: toQualityPercent(1 - Number(m.field_supplement_rate || 0))
    },
    {
      label: '字段保留率',
      value: toQualityPercent(1 - Number(m.field_missrecall_rate || 0))
    }
  ];
});

const clampAccuracyValue = (value: number) => Math.max(55, Math.min(99.5, value));

const fieldRecognitionRows = computed<FieldRecognitionRow[]>(() => {
  const idpBase = toQualityPercent(metrics.value.file_recognition_accuracy ?? metrics.value.recognition_accuracy);
  const mailBase = toQualityPercent(metrics.value.mail_recognition_accuracy ?? metrics.value.recognition_accuracy);
  const sceneSeed = hashInt(`${startDate.value}|${endDate.value}|${fixedTenantId}|${filters.source}|field-recognition`);

  return fieldRecognitionFields.map((field, index) => {
    const seed = sceneSeed + index * 53;
    const difficultyOffset = (pseudoRandom(seed + 11) - 0.5) * 12;
    const channelGap = (pseudoRandom(seed + 29) - 0.5) * 8;
    const idpAccuracy = clampAccuracyValue(idpBase + difficultyOffset + channelGap);
    const mailAccuracy = clampAccuracyValue(mailBase + difficultyOffset - channelGap);

    return {
      field,
      idpAccuracy: `${idpAccuracy.toFixed(1)}%`,
      mailAccuracy: `${mailAccuracy.toFixed(1)}%`
    };
  });
});

const showFieldIdpColumn = computed(() => filters.source !== 'email');
const showFieldMailColumn = computed(() => filters.source !== 'file');
const fieldRecognitionHint = computed(() => {
  if (showFieldIdpColumn.value && showFieldMailColumn.value) return 'IDP / MAIL';
  if (showFieldIdpColumn.value) return '仅展示 IDP';
  return '仅展示 MAIL';
});

const savedCostTrendRows = computed(() =>
  efficiencyRows.value.map((row) => {
    const volume = Number(row.submissions || 0);
    const savedProofreadingMinutesPerOrder = originalProofreadingMinutes.value - Number(row.proofreadingTime || 0);
    const savedAuditMinutesPerOrder = originalAuditMinutes.value - Number(row.auditTime || 0);

    const savedCost =
      (savedProofreadingMinutesPerOrder * volume * csRate.value) / 480 +
      (savedAuditMinutesPerOrder * volume * opsRate.value) / 480;

    return {
      name: row.name,
      savedCost: Number(savedCost.toFixed(1)),
      volume
    };
  })
);

const participantCount = computed(() => Number(metrics.value.participant_user_count || personRows.value.length || 0));

const personRankingRows = computed(() =>
  [...personRows.value]
    .sort((left, right) => right.processingCount - left.processingCount)
    .slice(0, 12)
);

const personDurationRows = computed(() =>
  [...personRows.value]
    .sort((left, right) => right.avgProcessingMinutes - left.avgProcessingMinutes)
    .slice(0, 12)
);

const personLaborCostRows = computed(() =>
  [...personRows.value]
    .map((item) => ({
      person: item.person,
      department: item.department,
      processingCount: item.processingCount,
      avgProcessingMinutes: item.avgProcessingMinutes,
      processingCostValue: item.processingCostValue,
      avgLaborCost: item.processingCount > 0 ? item.processingCostValue / item.processingCount : 0
    }))
    .sort((left, right) => right.avgLaborCost - left.avgLaborCost)
    .slice(0, 12)
);

const getSavedCostForPersonRow = (row: EfficiencyPersonRow) => {
  const savedProofreadingCost =
    row.avgProofreadingMinutes > 0
      ? ((originalProofreadingMinutes.value - row.avgProofreadingMinutes) * row.processingCount * csRate.value) / 480
      : 0;
  const savedAuditCost =
    row.avgAuditMinutes > 0
      ? ((originalAuditMinutes.value - row.avgAuditMinutes) * row.processingCount * opsRate.value) / 480
      : 0;
  return savedProofreadingCost + savedAuditCost;
};

const conversionTrendOption = computed<EChartsOption>(() => {
  const labels = conversionTimelineRows.value.map((item) => item.name);
  const shouldShowLabel = labels.length <= 8;

  return {
    color: ['#7c83ff', '#4f7df2', '#42b8d5', '#4cbf88'],
    grid: { left: 18, right: 16, top: 28, bottom: 36, containLabel: true },
    legend: { show: false },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#909399',
        fontSize: 11,
        interval: shouldShowLabel ? 0 : 'auto'
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#909399', fontSize: 11 },
      splitLine: { lineStyle: { color: '#eef1f6' } }
    },
    series: [
      {
        name: '来源输入',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 },
        data: conversionTimelineRows.value.map((item) => item.sourceInput)
      },
      {
        name: '成功创建工单',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 },
        data: conversionTimelineRows.value.map((item) => item.created)
      },
      {
        name: '工作单',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 },
        data: conversionTimelineRows.value.map((item) => item.transferred)
      },
      {
        name: '成功提交委托',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 },
        data: conversionTimelineRows.value.map((item) => item.submitted)
      }
    ]
  };
});

const missReasonOption = computed<EChartsOption>(() => ({
  color: missReasonColors,
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {d}% ({c})'
  },
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['50%', '72%'],
      center: ['58%', '46%'],
      startAngle: 90,
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: {
        borderColor: '#ffffff',
        borderWidth: 6
      },
      data: missReasons.value.map((item) => ({
        name: item.name,
        value: item.value
      }))
    }
  ]
}));

const efficiencyLineOption = computed<EChartsOption>(() => ({
  color: ['#94a3b8', '#6366f1', '#10b981'],
  grid: { left: 16, right: 16, top: 42, bottom: 34, containLabel: true },
  legend: { show: false },
  tooltip: {
    trigger: 'axis'
  },
  xAxis: {
    type: 'category',
    data: efficiencyRows.value.map((item) => item.name),
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    axisTick: { show: false },
    axisLabel: { color: '#909399', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#909399', fontSize: 11, formatter: '{value} min' },
    splitLine: { lineStyle: { color: '#eef1f6' } }
  },
  series: [
    {
      name: '处理总时长',
      type: 'line',
      smooth: true,
      data: efficiencyRows.value.map((item) => Number(item.totalTime.toFixed(1))),
      symbolSize: 6,
      lineStyle: { width: 3 }
    },
    {
      name: '校对时长',
      type: 'line',
      smooth: true,
      data: efficiencyRows.value.map((item) => Number(item.proofreadingTime.toFixed(1))),
      symbolSize: 5
    },
    {
      name: '审核时长',
      type: 'line',
      smooth: true,
      data: efficiencyRows.value.map((item) => Number(item.auditTime.toFixed(1))),
      symbolSize: 5
    }
  ]
}));

const efficiencyBarOption = computed<EChartsOption>(() => ({
  color: ['#10b981', '#f43f5e'],
  grid: { left: 16, right: 16, top: 34, bottom: 34, containLabel: true },
  legend: { show: false },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  xAxis: {
    type: 'category',
    data: efficiencyRows.value.map((item) => item.name),
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    axisTick: { show: false },
    axisLabel: { color: '#909399', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#909399', fontSize: 11 },
    splitLine: { lineStyle: { color: '#eef1f6' } }
  },
  series: [
    {
      name: '提交成功',
      type: 'bar',
      barWidth: 18,
      data: efficiencyRows.value.map((item) => item.submissions),
      itemStyle: { borderRadius: [4, 4, 0, 0] }
    },
    {
      name: '返工',
      type: 'bar',
      barWidth: 18,
      data: efficiencyRows.value.map((item) => item.rejections),
      itemStyle: { borderRadius: [4, 4, 0, 0] }
    }
  ]
}));

const qualityRadarOption = computed<EChartsOption>(() => {
  const indicators = qualityDimensionRows.value.map((item) => ({
    name: item.label,
    max: 100
  }));
  const values = qualityDimensionRows.value.map((item) => Number(item.value.toFixed(1)));

  return {
    tooltip: { trigger: 'item' },
    radar: {
      center: ['50%', '55%'],
      radius: '64%',
      splitNumber: 5,
      axisName: { color: '#606266', fontSize: 11 },
      splitLine: { lineStyle: { color: '#e5e7eb' } },
      splitArea: { areaStyle: { color: ['#fff', '#fafafa'] } },
      indicator: indicators
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: values,
            name: '质量得分',
            areaStyle: { color: 'rgba(87, 69, 255, 0.28)' },
            lineStyle: { color: '#5745ff', width: 2 },
            itemStyle: { color: '#5745ff' }
          }
        ]
      }
    ]
  };
});

const costTrendOption = computed<EChartsOption>(() => ({
  color: ['#6366f1', '#10b981'],
  grid: { left: 18, right: 18, top: 36, bottom: 28, containLabel: true },
  legend: { show: false },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: savedCostTrendRows.value.map((item) => item.name),
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    axisTick: { show: false },
    axisLabel: { color: '#909399', fontSize: 11 }
  },
  yAxis: [
    {
      type: 'value',
      name: '成本(¥)',
      nameTextStyle: { color: '#909399', fontSize: 11 },
      axisLabel: { color: '#909399', fontSize: 11 },
      splitLine: { lineStyle: { color: '#eef1f6' } }
    },
    {
      type: 'value',
      name: '提交量',
      nameTextStyle: { color: '#909399', fontSize: 11 },
      axisLabel: { color: '#909399', fontSize: 11 },
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: '节省成本',
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      data: savedCostTrendRows.value.map((item) => item.savedCost),
      areaStyle: { color: 'rgba(99, 102, 241, 0.16)' },
      lineStyle: { width: 2 }
    },
    {
      name: '工作单提交量',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: savedCostTrendRows.value.map((item) => item.volume),
      areaStyle: { color: 'rgba(16, 185, 129, 0.12)' },
      lineStyle: { width: 2 }
    }
  ]
}));

const efficiencyPersonRankingOption = computed<EChartsOption>(() => ({
  color: ['#4f46ff'],
  grid: { left: 18, right: 18, top: 24, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  xAxis: {
    type: 'value',
    axisLabel: { color: '#909399', fontSize: 11 },
    splitLine: { lineStyle: { color: '#eef1f6' } }
  },
  yAxis: {
    type: 'category',
    data: personRankingRows.value.map((item) => item.person),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    axisLabel: { color: '#909399', fontSize: 11 }
  },
  series: [
    {
      name: '处理单量',
      type: 'bar',
      barWidth: 16,
      data: personRankingRows.value.map((item) => item.processingCount),
      label: { show: true, position: 'right', color: '#4f46ff' }
    }
  ]
}));

const efficiencyPersonDurationOption = computed<EChartsOption>(() => ({
  color: ['#0ea5e9'],
  grid: { left: 18, right: 18, top: 24, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  xAxis: {
    type: 'value',
    axisLabel: { color: '#909399', fontSize: 11, formatter: '{value} min' },
    splitLine: { lineStyle: { color: '#eef1f6' } }
  },
  yAxis: {
    type: 'category',
    data: personDurationRows.value.map((item) => item.person),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    axisLabel: { color: '#909399', fontSize: 11 }
  },
  series: [
    {
      name: '平均投入时长',
      type: 'bar',
      barWidth: 16,
      data: personDurationRows.value.map((item) => Number(item.avgProcessingMinutes.toFixed(1))),
      label: { show: true, position: 'right', color: '#0ea5e9', formatter: '{c}min' }
    }
  ]
}));

const efficiencyPersonCostOption = computed<EChartsOption>(() => ({
  color: ['#f59e0b'],
  grid: { left: 18, right: 18, top: 24, bottom: 24, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: Array<{ data?: EfficiencyPersonCostBarDatum }>) => {
      const point = params?.[0]?.data as EfficiencyPersonCostBarDatum | undefined;
      if (!point) return '-';
      return `${point.person} / ${point.department}<br/>平均人力成本：¥${point.value.toFixed(1)} / 单<br/>处理单量：${point.processingCount}<br/>平均投入时长：${point.avgProcessingMinutes.toFixed(1)}min<br/>总处理成本：¥${point.processingCost.toFixed(1)}`;
    }
  },
  xAxis: {
    type: 'value',
    name: '平均人力成本(¥/单)',
    nameTextStyle: { color: '#909399', fontSize: 11 },
    axisLabel: { color: '#909399', fontSize: 11, formatter: '¥{value}' },
    splitLine: { lineStyle: { color: '#eef1f6' } }
  },
  yAxis: {
    type: 'category',
    data: personLaborCostRows.value.map((item) => item.person),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    axisLabel: { color: '#909399', fontSize: 11 }
  },
  series: [
    {
      name: '人员',
      type: 'bar',
      barWidth: 16,
      data: personLaborCostRows.value.map(
        (item) =>
          ({
            value: Number(item.avgLaborCost.toFixed(1)),
            person: item.person,
            department: item.department,
            processingCount: item.processingCount,
            avgProcessingMinutes: Number(item.avgProcessingMinutes.toFixed(1)),
            processingCost: Number(item.processingCostValue.toFixed(1)),
            itemStyle: {
              borderRadius: [0, 8, 8, 0]
            }
          }) satisfies EfficiencyPersonCostBarDatum
      ),
      emphasis: {
        focus: 'series',
        itemStyle: {
          color: '#f97316',
          shadowBlur: 18,
          shadowColor: 'rgba(124, 45, 18, 0.24)'
        }
      },
      label: {
        show: true,
        position: 'right',
        color: '#f59e0b',
        formatter: ({ value }: { value?: number }) => `¥${Number(value || 0).toFixed(1)}`
      },
      z: 2
    }
  ]
}));

const parseMinutes = (durationText: string) => {
  const value = Number(String(durationText ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? value : 0;
};

const durationToHours = (durationText: string) => `${(parseMinutes(durationText) / 60).toFixed(2)}h`;

const formatSavedCostPerRow = (row: WorkOrderRow) => {
  const proofreadingMinutes = parseMinutes(row.proofreadingTime);
  const auditMinutes = parseMinutes(row.auditTime);
  const savedProofreadingCost = ((originalProofreadingMinutes.value - proofreadingMinutes) * csRate.value) / 480;
  const savedAuditCost = ((originalAuditMinutes.value - auditMinutes) * opsRate.value) / 480;
  return `¥${(savedProofreadingCost + savedAuditCost).toFixed(1)}`;
};

const formatPersonDuration = (minutes: number) => `${minutes.toFixed(1)}min (${(minutes / 60).toFixed(1)}h)`;
const formatPersonCost = (value: number) => `¥${value.toFixed(1)}`;
const formatSavedCostForPersonRow = (row: EfficiencyPersonRow) => `¥${getSavedCostForPersonRow(row).toFixed(1)}`;
const detailRowKey = (row: WorkOrderRow | EfficiencyPersonRow) =>
  'person' in row ? `${row.department}-${row.person}` : row.sourceId;

const parsePercentRatio = (value: string) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed > 1 ? parsed / 100 : parsed;
};

const toInversePercent = (value: string) => {
  const ratio = parsePercentRatio(value);
  if (!Number.isFinite(ratio)) return '-';
  const normalized = Math.max(0, Math.min(1, 1 - ratio));
  return `${(normalized * 100).toFixed(1)}%`;
};

const customerHours = computed(() => Number(dashboardData.value.totalCSDays || 0) * 8);
const opsHours = computed(() => Number(dashboardData.value.totalOpsDays || 0) * 8);

const avgWorkOrderProcessingMinutes = computed(() => Number(metrics.value.avg_processing_duration_per_work_order || 0));
const avgProofreadingMinutes = computed(() => Number(metrics.value.avg_proofreading_duration_per_work_order || 0));
const avgAuditMinutes = computed(() => Number(metrics.value.avg_audit_duration_per_work_order || 0));

const avgFollowerCostPerWorkOrder = computed(() => Number(metrics.value.avg_follower_cost_per_work_order || 0));
const avgReviewerCostPerWorkOrder = computed(() => Number(metrics.value.avg_reviewer_cost_per_work_order || 0));
const avgTotalCostPerWorkOrder = computed(
  () => avgFollowerCostPerWorkOrder.value + avgReviewerCostPerWorkOrder.value
);

const totalFollowerCost = computed(() => (customerHours.value / 8) * csRate.value);
const totalReviewerCost = computed(() => (opsHours.value / 8) * opsRate.value);
const totalLaborCost = computed(() => totalFollowerCost.value + totalReviewerCost.value);

const handleKpiClick = (item: { tab: TabName; focus?: EfficiencyFocus }) => {
  if (activeAnalysisView.value === 'workorder') {
    activeTab.value = item.tab;
    return;
  }

  activeTab.value = 'cost';
  activeEfficiencyFocus.value = item.focus || 'processing-count';
};

const isKpiActive = (item: { tab: TabName; focus?: EfficiencyFocus }) =>
  activeAnalysisView.value === 'efficiency'
    ? activeEfficiencyFocus.value === (item.focus || 'processing-count')
    : activeTab.value === item.tab;

const isEfficiencyPanelActive = (focus: EfficiencyFocus) =>
  activeAnalysisView.value === 'efficiency' && activeEfficiencyFocus.value === focus;

const handleAnalysisViewChange = (value: AnalysisView) => {
  if (activeAnalysisView.value === value) return;
  activeAnalysisView.value = value;

  if (value === 'efficiency') {
    lastWorkOrderTab.value = activeTab.value;
    activeTab.value = 'cost';
    activeEfficiencyFocus.value = 'processing-count';
  } else {
    activeTab.value = lastWorkOrderTab.value || 'conversion';
  }

  applyOrgPathForView(value);
};

const handleOrgChange = (value: string[]) => {
  if (!value || value.length === 0) {
    applyOrgPathForView(activeAnalysisView.value);
    return;
  }
  applyOrgPathForView(activeAnalysisView.value, value);
};

watch(
  () => activeAnalysisView.value,
  (view) => {
    if (view === 'efficiency') {
      if (activeTab.value !== 'cost') {
        activeTab.value = 'cost';
      }
    } else if (!availableTabs.value.includes(activeTab.value)) {
      activeTab.value = lastWorkOrderTab.value || 'conversion';
    }

    applyOrgPathForView(view, orgPath.value);
  }
);

watch(
  orgPath,
  (path) => {
    if (!path || path.length === 0) {
      filters.org = allCompanyNode.value;
      return;
    }
    filters.org = path[path.length - 1] || allCompanyNode.value;
  },
  { deep: true }
);

watch(
  [
    dateRange,
    orgPath,
    () => filters.source,
    () => activeAnalysisView.value,
    () => activeTab.value,
    () => csRate.value,
    () => opsRate.value,
    () => originalProofreadingMinutes.value,
    () => originalAuditMinutes.value
  ],
  persistTopFilters,
  {
    deep: true,
    immediate: true
  }
);

const resetAllTablePages = () => {
  for (const tab of ['conversion', 'quality', 'cost', 'efficiencyCost'] as TableStateKey[]) {
    tableStates[tab].page = 1;
  }
};

watch(
  () => [
    startDate.value,
    endDate.value,
    filters.org,
    filters.source,
    csRate.value,
    opsRate.value,
    originalProofreadingMinutes.value,
    originalAuditMinutes.value
  ],
  () => {
    resetAllTablePages();
  }
);

watch(
  () => [
    activeAnalysisView.value,
    activeTab.value,
    startDate.value,
    endDate.value,
    filters.org,
    filters.source,
    csRate.value,
    opsRate.value,
    originalProofreadingMinutes.value,
    originalAuditMinutes.value
  ],
  (_, oldValues) => {
    if (!oldValues) return;
    triggerSwitching();
  }
);

const handleViewportResize = () => {
  viewportWidth.value = window.innerWidth;
};

onMounted(() => {
  handleViewportResize();
  window.addEventListener('resize', handleViewportResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize);
  if (switchingTimer !== null) {
    window.clearTimeout(switchingTimer);
    switchingTimer = null;
  }
});

const handleExport = async () => {
  const exportCount = activeAnalysisView.value === 'efficiency' ? personRows.value.length : allRows.value.length;
  if (exportCount > 10000) {
    ElMessage.warning('请缩小时间范围');
    return;
  }

  exporting.value = true;
  try {
    await exportDashboardWorkbook({
      analysisView: activeAnalysisView.value,
      source: filters.source,
      org: filters.org,
      startDate: startDate.value,
      endDate: endDate.value,
        csRate: csRate.value,
        opsRate: opsRate.value,
        originalProofreadingMinutes: originalProofreadingMinutes.value,
        originalAuditMinutes: originalAuditMinutes.value,
      data: dashboardData.value,
      fieldRecognitionRows: fieldRecognitionRows.value
    });
  } finally {
    window.setTimeout(() => {
      exporting.value = false;
    }, 0);
  }
};

const buildPreviewRows = (row: WorkOrderRow) => [
  ['发货人', fieldMockValueMap['发货人'] || '-', '收货人', fieldMockValueMap['收货人'] || '-'],
  ['工单ID', row.orderId || '-', '来源ID', row.sourceId],
  ['来源', row.source, '跟进人', row.user],
  ['货物类型', fieldMockValueMap['货物类型'] || '-', '英文品名', fieldMockValueMap['英文品名'] || '-'],
  ['收货地', fieldMockValueMap['收货地'] || '-', '卸货港', fieldMockValueMap['卸货港'] || '-']
];

const createPreviewFile = (row: WorkOrderRow, name: string, kind: PreviewFile['kind']): PreviewFile => {
  const aoa = buildPreviewRows(row);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  return {
    name,
    kind,
    sizeLabel: `${Math.max(1, Math.round(blob.size / 1024))}KB`,
    blob,
    tableRows: aoa.map((line) => ({
      c1: String(line[0] ?? ''),
      c2: String(line[1] ?? ''),
      c3: String(line[2] ?? ''),
      c4: String(line[3] ?? '')
    }))
  };
};

const downloadBlob = (blob: Blob, filename: string) => {
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

const selectedBusinessRow = ref<WorkOrderRow | null>(null);
const selectedEfficiencyRow = ref<WorkOrderRow | null>(null);
const selectedQualityRow = ref<WorkOrderRow | null>(null);
const selectedPreview = ref<PreviewFile | null>(null);

const businessDialogVisible = ref(false);
const previewDialogVisible = ref(false);
const efficiencyDialogVisible = ref(false);
const qualityDialogVisible = ref(false);

const openBusinessDetail = (row: WorkOrderRow) => {
  selectedBusinessRow.value = row;
  businessDialogVisible.value = true;
};

const openEfficiencyDetail = (row: WorkOrderRow) => {
  selectedEfficiencyRow.value = row;
  efficiencyDialogVisible.value = true;
};

const openQualityDetail = (row: WorkOrderRow) => {
  selectedQualityRow.value = row;
  qualityDialogVisible.value = true;
};

const openPreview = (file: PreviewFile) => {
  selectedPreview.value = file;
  previewDialogVisible.value = true;
};

const filesByRow = (row: WorkOrderRow) => {
  if (row.sourceKey === 'email') {
    return [createPreviewFile(row, `${row.sourceId}-邮件附件.xlsx`, '附件')];
  }
  return [createPreviewFile(row, `${row.sourceId}-来源文件.xlsx`, '文件')];
};

const detailFiles = computed(() => (selectedBusinessRow.value ? filesByRow(selectedBusinessRow.value) : []));

const businessDialogTitle = computed(() => {
  if (!selectedBusinessRow.value) return '业务详情';
  return selectedBusinessRow.value.sourceKey === 'email' ? '邮件详情' : '文件详情';
});

const emailDetail = computed(() => {
  if (!selectedBusinessRow.value || selectedBusinessRow.value.sourceKey !== 'email') return null;
  return {
    subject: `HPL-V2 接单测试-${selectedBusinessRow.value.sourceId}`,
    sender: '<wayne.chen@oneaix.com>',
    receiver: '<cursor_user12@1data.info>',
    cc: '<ops_team@1data.info>; <audit_team@1data.info>',
    time: `${endDate.value} 22:20:17`,
    body: '拆分测试\n请查收本次委托资料，附件包含托书与补充信息，请按附件内容处理。'
  };
});

const flowRecords = computed<FlowRecord[]>(() => {
  if (!selectedEfficiencyRow.value) return [];
  const row = selectedEfficiencyRow.value;
  return [
    { time: '09:00-09:02', person: row.user, stage: '校对', action: '编辑+保存' },
    { time: '09:30-09:32', person: row.user, stage: '校对', action: '编辑+提交审核' },
    { time: '10:00-10:01', person: row.auditor, stage: '审核', action: row.reworkCount > 0 ? '驳回' : '通过' },
    { time: '10:10-10:12', person: row.user, stage: '校对', action: '编辑+提交审核' },
    { time: '10:20-10:22', person: row.auditor, stage: '审核', action: row.status.includes('失败') ? '驳回' : '提交订舱' }
  ];
});

const hashInt = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const qualityFieldDetails = computed<FieldDetail[]>(() => {
  if (!selectedQualityRow.value) return [];

  const baseSeed = hashInt(`${selectedQualityRow.value.orderId}|${selectedQualityRow.value.workOrderId}`);

  return qualityFields.map((field, index) => {
    const seed = baseSeed + index * 97;
    const source = fieldSourceOptions[Math.floor(pseudoRandom(seed + 7) * fieldSourceOptions.length)] || '-';
    const raw = source === '-' ? '-' : fieldMockValueMap[field] || `${field}-原始值`;
    const cleaned = raw === '-' ? '-' : raw.replace(/\s+/g, ' ').trim();
    const submitted =
      cleaned === '-'
        ? '-'
        : pseudoRandom(seed + 19) > 0.8
          ? `${cleaned}(修正)`
          : cleaned;

    return {
      field,
      source,
      rawValue: raw,
      cleanedValue: cleaned,
      submittedValue: submitted
    };
  });
});

const qualitySourceColorMap: Record<FieldDetail['source'], { color: string; background: string }> = {
  托书: { color: '#6366f1', background: 'rgba(99, 102, 241, 0.14)' },
  历史单: { color: '#818cf8', background: 'rgba(129, 140, 248, 0.14)' },
  BC: { color: '#a5b4fc', background: 'rgba(165, 180, 252, 0.18)' },
  邮件: { color: '#60a5fa', background: 'rgba(96, 165, 250, 0.14)' },
  默认值: { color: '#f59e0b', background: 'rgba(245, 158, 11, 0.16)' },
  '-': { color: '#94a3b8', background: '#f1f5f9' }
};

const qualitySourceTagStyle = (source: FieldDetail['source']) => {
  const style = qualitySourceColorMap[source] || qualitySourceColorMap['-'];
  return {
    color: style.color,
    backgroundColor: style.background,
    borderColor: 'transparent'
  };
};

const detailTitleMap: Record<TabName, string> = {
  conversion: '业务明细表',
  quality: '质量明细表',
  cost: '效率成本表'
};

const detailTitle = computed(() => (activeAnalysisView.value === 'efficiency' ? '人效明细表' : detailTitleMap[activeTab.value]));
const detailSearchPlaceholder = computed(() => {
  if (activeAnalysisView.value === 'efficiency') return '搜索人员/业务部门';
  return activeTab.value === 'conversion' ? '搜索工单ID/来源ID' : '搜索工单ID/工作单ID';
});
</script>

<template>
  <div class="page-scale-shell">
    <div class="page-scale-canvas" :style="pageScaleStyle">
      <div class="page-container">
    <el-space direction="vertical" :size="16" fill class="page-stack">
      <el-card shadow="never" class="header-card">
        <div class="header-main-row">
          <el-space :size="12" class="brand-block">
            <div class="brand-icon-wrap">
              <el-icon>
                <Filter />
              </el-icon>
            </div>
            <el-text tag="b" class="main-title">小沓-BI</el-text>
          </el-space>
          <div class="top-controls-row">
            <div class="top-controls">
            <div class="control-group-inline control-group-analysis">
              <el-text type="info" size="small" class="top-control-label">分析维度</el-text>
              <div
                class="analysis-switch"
                role="radiogroup"
                aria-label="分析维度切换"
                :style="{ '--analysis-index': String(analysisSwitchIndex), '--analysis-count': String(analysisViewOptions.length) }"
              >
                <span class="analysis-switch-thumb"></span>
                <button
                  v-for="item in analysisViewOptions"
                  :key="item.value"
                  type="button"
                  class="analysis-switch-item"
                  :class="{ 'is-active': activeAnalysisView === item.value }"
                  @click="handleAnalysisViewChange(item.value)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <el-cascader
              v-model="orgPath"
              :options="orgTree"
              :props="orgProps"
              :show-all-levels="false"
              filterable
              :clearable="activeAnalysisView === 'efficiency'"
              :disabled="activeAnalysisView === 'workorder'"
              :placeholder="orgSelectorPlaceholder"
              class="control-org-inline"
              popper-class="top-filter-popper"
              @change="handleOrgChange"
            />
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              :shortcuts="dateShortcuts"
              :clearable="false"
              class="control-date-inline"
              popper-class="top-filter-popper"
            />
            <el-popover placement="bottom" :width="368" trigger="click" popper-class="cost-config-popper">
              <template #reference>
                <el-button class="cost-config-trigger">
                  <el-icon><Operation /></el-icon>
                  <span>成本参数</span>
                </el-button>
              </template>
              <div class="cost-config-panel">
                <div class="cost-config-head">
                  <el-text tag="b">全局成本参数</el-text>
                  <el-text type="info" size="small">影响节省成本、处理成本与人效口径</el-text>
                </div>
                <div class="cost-config-grid">
                  <div class="cost-config-row">
                    <span class="cost-config-label">客服成本</span>
                    <el-input-number v-model="csRate" :step="50" :min="0" controls-position="right" class="global-parameter-input" />
                    <el-text type="info" size="small">元/人天</el-text>
                  </div>
                  <div class="cost-config-row">
                    <span class="cost-config-label">操作成本</span>
                    <el-input-number v-model="opsRate" :step="50" :min="0" controls-position="right" class="global-parameter-input" />
                    <el-text type="info" size="small">元/人天</el-text>
                  </div>
                  <div class="cost-config-row">
                    <span class="cost-config-label">原校对时长</span>
                    <el-input-number
                      v-model="originalProofreadingMinutes"
                      :step="0.5"
                      :min="0"
                      :precision="1"
                      controls-position="right"
                      class="global-parameter-input global-parameter-input-minutes"
                    />
                    <el-text type="info" size="small">min/单</el-text>
                  </div>
                  <div class="cost-config-row">
                    <span class="cost-config-label">原审核时长</span>
                    <el-input-number
                      v-model="originalAuditMinutes"
                      :step="0.5"
                      :min="0"
                      :precision="1"
                      controls-position="right"
                      class="global-parameter-input global-parameter-input-minutes"
                    />
                    <el-text type="info" size="small">min/单</el-text>
                  </div>
                </div>
              </div>
            </el-popover>
            <div
              class="source-switch"
              role="radiogroup"
              aria-label="来源"
              :style="{ '--source-index': String(sourceSwitchIndex), '--source-count': String(sourceOptions.length) }"
            >
              <span class="source-switch-thumb"></span>
              <button
                v-for="item in sourceOptions"
                :key="item.value"
                type="button"
                class="source-switch-item"
                :class="{ 'is-active': filters.source === item.value }"
                @click="filters.source = item.value"
              >
                {{ item.label }}
              </button>
            </div>
            <el-button type="primary" :icon="Download" :loading="exporting" @click="handleExport">导出</el-button>
            </div>
          </div>
        </div>
      </el-card>

      <div class="dashboard-main">
        <div class="dashboard-content" :class="{ 'is-switching': isSwitching }">
          <el-row :gutter="16" class="kpi-row">
            <el-col v-for="item in kpis" :key="item.label" :span="kpiColSpan">
              <el-card shadow="never" class="kpi-card" :class="{ 'is-active': isKpiActive(item) }" @click="handleKpiClick(item)">
                <el-row justify="space-between" align="middle" class="kpi-head">
                  <el-text class="kpi-label">{{ item.label }}</el-text>
                  <el-tag :type="trendType(item.trend)" effect="light" round size="small" class="kpi-trend-tag" :class="`is-${item.trend}`">
                    {{ trendLabel(item.trend) }} {{ item.mom }}
                  </el-tag>
                </el-row>
                <el-text tag="b" class="kpi-value">{{ item.value }}</el-text>
                <el-text type="info" size="small">较上周期</el-text>
              </el-card>
            </el-col>
          </el-row>

        <el-card shadow="never" class="content-card">
          <div class="module-content">
            <el-space direction="vertical" :size="16" fill class="module-content-stack">
              
              <template v-if="activeAnalysisView === 'workorder' && activeTab === 'conversion'">
                <el-row :gutter="16">
                  <el-col :span="16">
                    <el-card shadow="never" class="panel-card">
                      <el-row align="middle" class="panel-head conversion-head-grid">
                        <el-text tag="b" class="head-title-left">业务单量</el-text>
                        <div class="chart-legend conversion-legend conversion-center-legend">
                          <span class="chart-legend-item">
                            <span class="chart-legend-dot legend-stage-source"></span>来源输入
                          </span>
                          <span class="chart-legend-item">
                            <span class="chart-legend-dot legend-stage-create"></span>成功创建工单
                          </span>
                          <span class="chart-legend-item">
                            <span class="chart-legend-dot legend-stage-transfer"></span>工作单
                          </span>
                          <span class="chart-legend-item">
                            <span class="chart-legend-dot legend-stage-submit"></span>成功提交委托
                          </span>
                        </div>
                        <span class="head-right-spacer"></span>
                      </el-row>
                      <EChart
                        :option="conversionTrendOption"
                        :active="activeTab === 'conversion'"
                        :height="chartHeight(420)"
                      />
                      <div class="conversion-stage-summary">
                        <div v-for="item in conversionStageTotals" :key="`sum-${item.name}`" class="conversion-stage-item">
                          <el-text type="info" size="small">{{ item.name }}</el-text>
                          <el-text tag="b" class="conversion-stage-value">{{ item.total.toLocaleString() }}</el-text>
                        </div>
                      </div>
                    </el-card>
                  </el-col>
                  <el-col :span="8">
                    <el-card shadow="never" class="panel-card">
                      <el-space direction="vertical" :size="12" fill class="miss-panel-stack">
                        <el-row justify="space-between" align="middle">
                          <el-text tag="b">漏单深度分析</el-text>
                        </el-row>
                        <div class="miss-summary-box">
                          <el-row justify="space-between" align="middle">
                            <el-text class="miss-summary-label">当前漏单率</el-text>
                            <el-text type="danger" size="small">目标: &lt; 5%</el-text>
                          </el-row>
                          <el-space :size="8" align="baseline">
                            <el-text class="miss-summary-value">{{ missRateText }}</el-text>
                            <el-text type="danger" size="small">较上周期 ↑ 0.2%</el-text>
                          </el-space>
                        </div>
                        <el-row justify="space-between" align="middle">
                          <el-text tag="b">漏单原因占比</el-text>
                        </el-row>
                        <div class="miss-chart-wrap">
                          <EChart :option="missReasonOption" :active="activeTab === 'conversion'" :height="chartHeight(230)" />
                        </div>
                        <div class="miss-legend-list">
                          <div v-for="(reason, index) in missReasons" :key="reason.name" class="miss-legend-row">
                            <span class="miss-legend-left">
                              <span class="chart-legend-dot" :style="{ backgroundColor: missReasonColors[index] }"></span>
                              {{ reason.name }}
                            </span>
                            <span class="miss-legend-ratio">{{ (reason.ratio * 100).toFixed(1) }}%</span>
                          </div>
                        </div>
                      </el-space>
                    </el-card>
                  </el-col>
                </el-row>
              </template>

              <template v-else-if="activeAnalysisView === 'workorder' && activeTab === 'quality'">
                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-card shadow="never" class="panel-card">
                      <el-row align="middle" class="panel-head quality-head-grid">
                        <el-text tag="b" class="head-title-left">核心质量指标（工作单维度）</el-text>
                        <div class="chart-legend quality-center-legend">
                          <span class="chart-legend-item">
                            <span class="chart-legend-dot legend-radar"></span>质量得分
                          </span>
                        </div>
                        <span class="head-right-spacer"></span>
                      </el-row>
                      <EChart :option="qualityRadarOption" :active="activeTab === 'quality'" :height="chartHeight(360)" />
                    </el-card>
                  </el-col>
                  <el-col :span="16">
                    <el-card shadow="never" class="panel-card">
                      <el-row justify="space-between" align="middle" class="panel-head panel-head-wrap">
                        <el-text tag="b">字段识别准确率（字段维度）</el-text>
                        <el-text type="info" size="small">{{ fieldRecognitionHint }}</el-text>
                      </el-row>
                      <el-table :data="fieldRecognitionRows" class="field-accuracy-table" height="360">
                        <el-table-column prop="field" label="字段名称" min-width="180" />
                        <el-table-column v-if="showFieldIdpColumn" prop="idpAccuracy" label="IDP" min-width="120" align="center">
                          <template #default="{ row }">
                            <el-text class="field-accuracy-idp">{{ row.idpAccuracy }}</el-text>
                          </template>
                        </el-table-column>
                        <el-table-column v-if="showFieldMailColumn" prop="mailAccuracy" label="MAIL" min-width="120" align="center">
                          <template #default="{ row }">
                            <el-text class="field-accuracy-mail">{{ row.mailAccuracy }}</el-text>
                          </template>
                        </el-table-column>
                      </el-table>
                    </el-card>
                  </el-col>
                </el-row>
              </template>
              <template v-else-if="activeAnalysisView === 'workorder'">
                <el-space direction="vertical" :size="16" fill class="cost-stack">
                  <el-row :gutter="16">
                    <el-col :span="8">
                      <el-card shadow="never" class="metric-card metric-card-basic metric-card-split">
                        <div class="metric-split">
                          <div class="metric-main">
                            <el-text type="info" size="small">平均每工作单成本</el-text>
                            <el-text tag="b" class="metric-value">¥{{ avgTotalCostPerWorkOrder.toFixed(1) }}</el-text>
                          </div>
                          <div class="metric-side">
                            <el-text type="info" size="small" class="metric-side-item">客服 ¥{{ avgFollowerCostPerWorkOrder.toFixed(1) }}</el-text>
                            <el-text type="info" size="small" class="metric-side-item">操作 ¥{{ avgReviewerCostPerWorkOrder.toFixed(1) }}</el-text>
                          </div>
                        </div>
                      </el-card>
                    </el-col>
                    <el-col :span="8">
                      <el-card shadow="never" class="metric-card metric-card-basic metric-card-split">
                        <div class="metric-split">
                          <div class="metric-main processing-metric-main">
                            <el-text type="info" size="small">平均处理时长</el-text>
                            <el-text tag="b" class="metric-value">{{ avgWorkOrderProcessingMinutes.toFixed(1) }}min</el-text>
                          </div>
                          <div class="metric-side processing-side">
                            <el-text type="info" size="small" class="metric-side-item">校对时长：{{ avgProofreadingMinutes.toFixed(1) }} min</el-text>
                            <el-text type="info" size="small" class="metric-side-item">审核时长：{{ avgAuditMinutes.toFixed(1) }} min</el-text>
                          </div>
                        </div>
                      </el-card>
                    </el-col>
                    <el-col :span="8">
                      <el-card shadow="never" class="metric-card metric-card-rate metric-card-rate-merged">
                        <div class="rate-card-stack">
                          <el-text type="info" size="small" class="rate-card-title">投入时间</el-text>
                          <div class="rate-merged-row">
                            <div class="rate-merged-metric">
                              <span class="rate-main-title">客服：</span>
                              <div class="metric-value-row">
                                <span class="metric-value metric-value-compact">{{ customerHours.toFixed(1) }}</span>
                                <span class="metric-unit">h</span>
                              </div>
                            </div>
                          </div>
                          <div class="rate-merged-row">
                            <div class="rate-merged-metric">
                              <span class="rate-main-title">操作：</span>
                              <div class="metric-value-row">
                                <span class="metric-value metric-value-compact">{{ opsHours.toFixed(1) }}</span>
                                <span class="metric-unit">h</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </el-card>
                    </el-col>
                  </el-row>

                  <el-row :gutter="16">
                    <el-col :span="8">
                      <el-card shadow="never" class="panel-card">
                        <el-row align="middle" class="panel-head cost-head-grid">
                          <el-text tag="b" class="head-title-left">节省成本与单量趋势</el-text>
                          <div class="chart-legend cost-center-legend">
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-cost"></span>节省成本
                            </span>
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-submit"></span>工作单提交量
                            </span>
                          </div>
                          <span class="head-right-spacer"></span>
                        </el-row>
                        <EChart :option="costTrendOption" :active="activeTab === 'cost'" :height="chartHeight(350)" />
                      </el-card>
                    </el-col>
                    <el-col :span="8">
                      <el-card shadow="never" class="panel-card">
                        <el-row align="middle" class="panel-head efficiency-head-grid">
                          <el-text tag="b" class="head-title-left">平均处理时长趋势（min）</el-text>
                          <div class="chart-legend efficiency-center-legend">
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-total"></span>处理总时长
                            </span>
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-proof"></span>校对时长
                            </span>
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-audit"></span>审核时长
                            </span>
                          </div>
                          <span class="head-right-spacer"></span>
                        </el-row>
                        <EChart :option="efficiencyLineOption" :active="activeTab === 'cost'" :height="chartHeight(350)" />
                      </el-card>
                    </el-col>
                    <el-col :span="8">
                      <el-card shadow="never" class="panel-card">
                        <el-row align="middle" class="panel-head efficiency-head-grid">
                          <el-text tag="b" class="head-title-left">工作单提交与返工分布</el-text>
                          <div class="chart-legend efficiency-center-legend">
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-submit"></span>提交成功
                            </span>
                            <span class="chart-legend-item">
                              <span class="chart-legend-dot legend-reject"></span>返工
                            </span>
                          </div>
                          <el-text type="danger" class="kpi-inline head-right-metric">返工率 {{ toPercent(metrics.rework_rate) }}</el-text>
                        </el-row>
                        <EChart :option="efficiencyBarOption" :active="activeTab === 'cost'" :height="chartHeight(350)" />
                      </el-card>
                    </el-col>
                  </el-row>
                </el-space>
              </template>
              <template v-else>
                <el-space direction="vertical" :size="16" fill class="cost-stack efficiency-cost-stack">
                  <el-row :gutter="16">
                    <el-col :span="8">
                      <div class="section-anchor">
                        <el-card shadow="never" class="panel-card" :class="{ 'is-active': isEfficiencyPanelActive('processing-count') }">
                          <el-row align="middle" class="panel-head efficiency-head-grid">
                            <el-text tag="b" class="head-title-left">人员处理单量排行</el-text>
                            <div class="chart-legend efficiency-center-legend">
                              <span class="chart-legend-item">
                                <span class="chart-legend-dot legend-stage-create"></span>处理单量
                              </span>
                            </div>
                            <span class="head-right-spacer"></span>
                          </el-row>
                          <EChart :option="efficiencyPersonRankingOption" :active="activeAnalysisView === 'efficiency'" :height="chartHeight(350)" />
                        </el-card>
                      </div>
                    </el-col>
                    <el-col :span="8">
                      <div class="section-anchor">
                        <el-card shadow="never" class="panel-card" :class="{ 'is-active': isEfficiencyPanelActive('processing-duration') }">
                          <el-row align="middle" class="panel-head efficiency-head-grid">
                            <el-text tag="b" class="head-title-left">人员平均投入时长分布</el-text>
                            <div class="chart-legend efficiency-center-legend">
                              <span class="chart-legend-item">
                                <span class="chart-legend-dot legend-total"></span>平均投入时长
                              </span>
                            </div>
                            <span class="head-right-spacer"></span>
                          </el-row>
                          <EChart :option="efficiencyPersonDurationOption" :active="activeAnalysisView === 'efficiency'" :height="chartHeight(350)" />
                        </el-card>
                      </div>
                    </el-col>
                    <el-col :span="8">
                      <div class="section-anchor">
                        <el-card shadow="never" class="panel-card" :class="{ 'is-active': isEfficiencyPanelActive('labor-cost') }">
                          <el-row align="middle" class="panel-head efficiency-head-grid">
                            <el-text tag="b" class="head-title-left">人员平均人力成本分布</el-text>
                            <div class="chart-legend efficiency-center-legend">
                              <span class="chart-legend-item">
                                <span class="chart-legend-dot legend-person-cost"></span>平均人力成本
                              </span>
                            </div>
                            <span class="head-right-spacer"></span>
                          </el-row>
                          <EChart
                            :option="efficiencyPersonCostOption"
                            :active="activeAnalysisView === 'efficiency'"
                            :height="chartHeight(350)"
                          />
                        </el-card>
                      </div>
                    </el-col>
                  </el-row>
                </el-space>
              </template>
            </el-space>
          </div>
        </el-card>

        <div>
        <el-card shadow="never" class="detail-card">
        <el-row justify="space-between" align="middle" class="detail-toolbar">
          <el-space :size="8">
            <div class="title-line"></div>
            <el-text tag="b">{{ detailTitle }}</el-text>
          </el-space>
          <el-input v-model="currentKeyword" clearable :placeholder="detailSearchPlaceholder" class="search-input">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
        </el-row>

        <el-table :data="pagedRows" :row-key="detailRowKey" class="detail-table">
          <template v-if="activeAnalysisView === 'efficiency'">
            <el-table-column label="人员" prop="person" min-width="110" />
            <el-table-column label="业务部门（分公司）" prop="department" min-width="150" />
            <el-table-column label="处理单量" prop="processingCount" min-width="120" align="center" />
            <el-table-column label="平均投入时长" min-width="150" align="center">
              <template #default="{ row }">
                <el-text class="duration-inline">{{ formatPersonDuration(row.avgProcessingMinutes) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="投入总时长" min-width="170" align="center">
              <template #default="{ row }">
                <el-text class="duration-inline">{{ formatPersonDuration(row.totalProcessingMinutes) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="时长成本" min-width="130" align="center">
              <template #default="{ row }">
                <el-text class="processing-cost-text">{{ formatPersonCost(row.processingCostValue) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="节省成本" min-width="130" align="center">
              <template #default="{ row }">
                <el-text class="saved-cost-text">{{ formatSavedCostForPersonRow(row) }}</el-text>
              </template>
            </el-table-column>
          </template>
          <template v-else-if="activeTab === 'conversion'">
            <el-table-column label="来源ID" min-width="110">
              <template #default="{ row }">
                <el-text class="id-text">{{ row.sourceId }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="工单ID" min-width="110">
              <template #default="{ row }">
                <el-text class="id-text">{{ row.orderId }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="接单来源" min-width="100">
              <template #default="{ row }">
                <el-tag effect="light" round size="small" class="source-pill" :class="`source-${row.sourceKey}`">{{ row.source }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="90">
              <template #default="{ row }">
                <span class="status-text" :class="row.status.includes('成功') ? 'status-success' : 'status-failed'">
                  <span class="status-dot"></span>
                  {{ row.status }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="漏单原因" prop="reason" min-width="140" />
            <el-table-column label="跟进人" prop="user" min-width="90" />
            <el-table-column label="创建时间" prop="createdAt" min-width="170" />
            <el-table-column label="操作" fixed="right" width="90" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openBusinessDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </template>
          <template v-else-if="activeTab === 'quality'">
            <el-table-column label="工单ID" min-width="110">
              <template #default="{ row }">
                <el-text class="id-text">{{ row.orderId }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="工作单ID" min-width="110">
              <template #default="{ row }">
                <el-text class="id-text">{{ row.workOrderId }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="接单来源" min-width="100">
              <template #default="{ row }">
                <el-tag effect="light" round size="small" class="source-pill" :class="`source-${row.sourceKey}`">{{ row.source }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="文件识别准确率" prop="fileRecognitionAccuracy" min-width="130">
              <template #default="{ row }">
                <el-text class="accuracy-rate-text">{{ row.fileRecognitionAccuracy }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="邮件识别准确率" prop="mailRecognitionAccuracy" min-width="130">
              <template #default="{ row }">
                <el-text class="accuracy-rate-text">{{ row.mailRecognitionAccuracy }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="字段一次通过率" prop="firstPassRate" min-width="130" />
            <el-table-column label="字段未修改率" min-width="110">
              <template #default="{ row }">
                <el-text>{{ toInversePercent(row.fieldModRate) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="字段无需补录率" min-width="120">
              <template #default="{ row }">
                <el-text>{{ toInversePercent(row.fieldSuppRate) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="字段保留率" min-width="100">
              <template #default="{ row }">
                <el-text>{{ toInversePercent(row.falseRecallRate) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="跟进人" prop="user" min-width="90" />
            <el-table-column label="结束时间" prop="endedAt" min-width="170" />
            <el-table-column label="操作" fixed="right" width="80" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openQualityDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </template>
          <template v-else>
            <el-table-column label="工单ID" min-width="110">
              <template #default="{ row }">
                <el-text class="id-text">{{ row.orderId }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="工作单ID" min-width="110">
              <template #default="{ row }">
                <el-text class="id-text">{{ row.workOrderId }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="接单来源" min-width="100">
              <template #default="{ row }">
                <el-tag effect="light" round size="small" class="source-pill" :class="`source-${row.sourceKey}`">{{ row.source }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="节省成本" min-width="110">
              <template #default="{ row }">
                <el-text class="saved-cost-text">{{ formatSavedCostPerRow(row) }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="处理成本" prop="processingCost" min-width="110">
              <template #default="{ row }">
                <el-text class="processing-cost-text">{{ row.processingCost }}</el-text>
              </template>
            </el-table-column>
            <el-table-column label="处理时长" prop="totalTime" min-width="120">
              <template #default="{ row }">
                <el-text class="duration-inline">
                  {{ row.totalTime }}<span class="duration-hour-inline">({{ durationToHours(row.totalTime) }})</span>
                </el-text>
              </template>
            </el-table-column>
            <el-table-column label="校对成本" prop="proofreadingCost" min-width="110" />
            <el-table-column label="校对时长" prop="proofreadingTime" min-width="120" />
            <el-table-column label="跟进人" prop="user" min-width="90" />
            <el-table-column label="审核成本" prop="auditCost" min-width="110" />
            <el-table-column label="审核时长" prop="auditTime" min-width="120" />
            <el-table-column label="审核人" prop="auditor" min-width="90" />
            <el-table-column label="返工次数" prop="reworkCount" min-width="90" align="center">
              <template #default="{ row }">
                <el-text class="rework-count-text" :class="Number(row.reworkCount) > 0 ? 'is-positive' : 'is-zero'">
                  {{ row.reworkCount }}
                </el-text>
              </template>
            </el-table-column>
            <el-table-column label="结束时间" prop="endedAt" min-width="170" />
          </template>
        </el-table>

        <div class="pager-wrap">
          <el-pagination
            background
            :current-page="currentTableState.page"
            :page-size="currentTableState.pageSize"
            :page-sizes="pageSizes"
            :pager-count="7"
            layout="total, sizes, prev, pager, next, jumper"
            :total="filteredRows.length"
            @current-change="updateCurrentPage"
            @size-change="updateCurrentPageSize"
          />
        </div>
        </el-card>
        </div>

        </div>
        <transition name="switch-fade">
          <div v-if="isSwitching" class="switching-mask"></div>
        </transition>
      </div>
    </el-space>

    <el-dialog v-model="businessDialogVisible" :title="businessDialogTitle" width="860px" class="business-detail-dialog" destroy-on-close>
      <template v-if="selectedBusinessRow?.sourceKey === 'email' && emailDetail">
        <div class="email-detail-layout">
          <el-card shadow="never" class="email-meta-card">
            <div class="email-head-row">
              <div class="email-subject-wrap">
                <el-tag effect="light" round>邮件</el-tag>
                <el-text tag="b" class="email-subject-text">{{ emailDetail.subject }}</el-text>
              </div>
              <el-text type="info" size="small">{{ emailDetail.time }}</el-text>
            </div>
            <div class="email-address-row">
              <el-text type="info" size="small" class="email-address-label">发送人</el-text>
              <el-text size="small" class="email-address-value">{{ emailDetail.sender }}</el-text>
            </div>
            <div class="email-address-row">
              <el-text type="info" size="small" class="email-address-label">收件人</el-text>
              <el-text size="small" class="email-address-value">{{ emailDetail.receiver }}</el-text>
            </div>
            <div class="email-address-row">
              <el-text type="info" size="small" class="email-address-label">抄送人</el-text>
              <el-text size="small" class="email-address-value">{{ emailDetail.cc }}</el-text>
            </div>
          </el-card>
          <el-card shadow="never" class="email-body-card">
            <el-text class="email-body-text">{{ emailDetail.body }}</el-text>
          </el-card>
          <el-card shadow="never" class="email-attachments-card">
            <div class="email-attachments-head">
              <el-icon>
                <Document />
              </el-icon>
              <el-text type="info" size="small">{{ detailFiles.length }} 个附件</el-text>
            </div>
            <div class="file-list">
              <div v-for="file in detailFiles" :key="file.name" class="file-row">
                <div class="file-icon">
                  <el-icon>
                    <Document />
                  </el-icon>
                </div>
                <div class="file-name-wrap">
                  <el-text>{{ file.name }}</el-text>
                  <el-text type="info" size="small">{{ file.sizeLabel }}</el-text>
                </div>
                <div class="file-actions">
                  <el-button link :icon="View" @click="openPreview(file)">预览</el-button>
                  <el-button link :icon="Download" @click="downloadBlob(file.blob, file.name)">下载</el-button>
                </div>
              </div>
            </div>
          </el-card>
        </div>
      </template>
      <template v-else-if="selectedBusinessRow">
        <el-space direction="vertical" :size="12" fill class="business-detail-space">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="工单ID">{{ selectedBusinessRow.orderId || '-' }}</el-descriptions-item>
            <el-descriptions-item label="来源ID">{{ selectedBusinessRow.sourceId }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ selectedBusinessRow.source }}</el-descriptions-item>
            <el-descriptions-item label="跟进人">{{ selectedBusinessRow.user || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-card shadow="never">
            <div class="file-list">
              <div v-for="file in detailFiles" :key="file.name" class="file-row">
                <div class="file-icon">
                  <el-icon>
                    <Document />
                  </el-icon>
                </div>
                <div class="file-name-wrap">
                  <el-text>{{ file.name }}</el-text>
                  <el-text type="info" size="small">{{ file.sizeLabel }}</el-text>
                </div>
                <div class="file-actions">
                  <el-button link :icon="View" @click="openPreview(file)">预览</el-button>
                  <el-button link :icon="Download" @click="downloadBlob(file.blob, file.name)">下载</el-button>
                </div>
              </div>
            </div>
          </el-card>
        </el-space>
      </template>
    </el-dialog>
    <el-dialog v-model="previewDialogVisible" width="92%" top="3vh" class="preview-dialog" destroy-on-close>
      <template #header>
        <div class="dialog-header">
          <el-text tag="b">文件预览</el-text>
          <el-space :size="8">
            <el-text type="info" size="small">{{ selectedPreview?.name || '-' }}</el-text>
            <el-button
              v-if="selectedPreview"
              link
              type="primary"
              :icon="Download"
              @click="downloadBlob(selectedPreview.blob, selectedPreview.name)"
            >
              下载
            </el-button>
          </el-space>
        </div>
      </template>
      <div class="preview-wrap">
        <table class="preview-table">
          <tbody>
            <tr v-for="(line, idx) in selectedPreview?.tableRows || []" :key="`${selectedPreview?.name || 'p'}-${idx}`">
              <td class="preview-key">{{ line.c1 }}</td>
              <td>{{ line.c2 }}</td>
              <td class="preview-key">{{ line.c3 }}</td>
              <td>{{ line.c4 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </el-dialog>

    <el-dialog v-model="efficiencyDialogVisible" title="操作流转记录" width="760px" destroy-on-close>
      <el-text type="info" size="small">
        工单ID {{ selectedEfficiencyRow?.orderId || '-' }} / 工作单ID {{ selectedEfficiencyRow?.workOrderId || '-' }}
      </el-text>
      <el-table :data="flowRecords" class="flow-table">
        <el-table-column prop="time" label="时间" min-width="140" />
        <el-table-column prop="person" label="人员" min-width="100" />
        <el-table-column label="环节" min-width="100">
          <template #default="{ row }">
            <el-tag effect="light" round size="small" :type="row.stage === '校对' ? 'info' : 'success'">{{ row.stage }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="动作" min-width="160" />
      </el-table>
    </el-dialog>

    <el-dialog v-model="qualityDialogVisible" title="字段识别及编辑情况" width="1120px" destroy-on-close>
      <el-text type="info" size="small">
        工单ID {{ selectedQualityRow?.orderId || '-' }} / 工作单ID {{ selectedQualityRow?.workOrderId || '-' }}
      </el-text>
      <el-table :data="qualityFieldDetails" class="quality-detail-table" height="520">
        <el-table-column prop="field" label="字段" min-width="140" />
        <el-table-column label="来源" min-width="100">
          <template #default="{ row }">
            <el-tag effect="light" round size="small" class="quality-source-pill" :style="qualitySourceTagStyle(row.source)">
              {{ row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rawValue" label="原始值" min-width="240" />
        <el-table-column prop="cleanedValue" label="清洗值" min-width="240" />
        <el-table-column prop="submittedValue" label="提交值" min-width="240" />
      </el-table>
    </el-dialog>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-scale-shell {
  width: 100%;
  min-height: 100vh;
  overflow-x: auto;
  overflow-y: visible;
}

.page-scale-canvas {
  --page-scale: 1;
  --design-width: 1760px;
  width: var(--design-width);
  min-width: var(--design-width);
  margin: 0 auto;
  zoom: var(--page-scale);
}

@supports not (zoom: 1) {
  .page-scale-canvas {
    transform: scale(var(--page-scale));
    transform-origin: top center;
  }
}

.page-container {
  min-height: 100vh;
  width: 100%;
  padding: 14px 16px 16px;
  box-sizing: border-box;
  background: #f3f6fb;
  --brand-primary: #4f46ff;
  --brand-primary-hover: #635bff;
  --brand-primary-soft: #eef0ff;
  --brand-success: #00a97b;
  --brand-danger: #ff2f66;
  --brand-text-strong: #0f2147;
  --brand-text-normal: #4d5e80;
  --card-border: #d9e1ed;
}

.page-stack {
  width: 100%;
  display: flex !important;
}

.module-content-stack,
.cost-stack {
  width: 100%;
  display: flex !important;
}

.module-content-stack :deep(.el-space__item),
.cost-stack :deep(.el-space__item) {
  width: 100%;
}

.module-content {
  width: 100%;
  min-width: 0;
}

.module-content :deep(.el-row),
.module-content :deep(.el-col) {
  min-width: 0;
}

.header-card,
.filter-card,
.content-card,
.detail-card,
.panel-card {
  border-radius: 16px;
  border-color: var(--card-border);
}

.header-card :deep(.el-card__body),
.content-card :deep(.el-card__body),
.detail-card :deep(.el-card__body),
.panel-card :deep(.el-card__body) {
  padding: 16px;
  min-width: 0;
}

.header-card :deep(.el-card__body) {
  padding: 10px 16px;
}

.header-main-row {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.top-controls-row {
  min-width: 0;
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.top-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: 10px;
  min-width: 0;
}

.control-group-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
}

.control-group-analysis {
  margin-right: 2px;
}

.top-control-label {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--brand-text-normal);
}

.global-parameter-input {
  width: 118px;
}

.global-parameter-input-minutes {
  width: 106px;
}

.global-parameter-input :deep(.el-input__wrapper) {
  min-height: 28px;
}

.global-parameter-input :deep(.el-input__inner) {
  text-align: center;
}

.brand-block {
  align-items: center;
  flex-shrink: 0;
}

.brand-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--brand-primary);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.title-area {
  margin-top: 0;
}

.main-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--brand-text-strong);
  line-height: 1.2;
}

.control-date-inline {
  width: 252px;
}

.control-org-inline {
  width: 190px;
}

.cost-config-trigger {
  height: 38px;
  border-radius: 10px;
  padding: 0 14px;
  border-color: #d7dfeb;
  color: var(--brand-text-normal);
  font-weight: 600;
}

.cost-config-trigger:hover,
.cost-config-trigger:focus-visible {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.cost-config-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cost-config-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cost-config-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cost-config-row {
  min-height: 38px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: #f8faff;
  border: 1px solid #dfe7f5;
}

.cost-config-label {
  color: var(--brand-text-normal);
  font-size: 13px;
  font-weight: 600;
}

.control-date-inline :deep(.el-input__wrapper),
.control-org-inline :deep(.el-input__wrapper),
.source-switch {
  border-radius: 10px;
}

.control-date-inline :deep(.el-input__wrapper),
.control-org-inline :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--brand-primary) inset !important;
  border-color: var(--brand-primary) !important;
  min-height: 38px;
  --el-color-primary: var(--brand-primary);
}

.control-date-inline :deep(.el-input__wrapper:hover),
.control-org-inline :deep(.el-input__wrapper:hover),
.control-date-inline :deep(.el-range-editor:hover),
.control-org-inline :deep(.el-range-editor:hover) {
  box-shadow: 0 0 0 1px var(--brand-primary) inset !important;
  border-color: var(--brand-primary) !important;
}

.control-date-inline :deep(.el-input__wrapper.is-focus),
.control-org-inline :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--brand-primary) inset !important;
  border-color: var(--brand-primary) !important;
}

.control-date-inline :deep(.el-input__icon),
.control-org-inline :deep(.el-input__icon),
.control-date-inline :deep(.el-range-separator) {
  color: var(--brand-primary);
}

.source-switch {
  --source-index: 0;
  --source-count: 3;
  min-width: 246px;
  height: 38px;
  padding: 3px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(var(--source-count), minmax(0, 1fr));
  align-items: center;
  position: relative;
  background: #edf1f7;
  border: 1px solid #d7dfeb;
  overflow: hidden;
}

.source-switch-thumb {
  position: absolute;
  left: 3px;
  top: 3px;
  width: calc((100% - 6px) / var(--source-count));
  height: calc(100% - 6px);
  border-radius: 8px;
  background: var(--brand-primary);
  box-shadow: 0 3px 10px rgba(79, 70, 255, 0.3);
  transform: translateX(calc(var(--source-index) * 100%));
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s ease;
}

.source-switch-item {
  position: relative;
  z-index: 1;
  height: 30px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--brand-text-normal);
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.2s ease, transform 0.2s ease;
}

.source-switch-item:hover {
  color: var(--brand-primary);
}

.source-switch-item.is-active {
  color: #ffffff;
  font-weight: 700;
}

.analysis-switch {
  --analysis-index: 0;
  --analysis-count: 2;
  min-width: 224px;
  height: 38px;
  padding: 3px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(var(--analysis-count), minmax(0, 1fr));
  align-items: center;
  position: relative;
  background: #edf1f7;
  border: 1px solid #d7dfeb;
  border-radius: 12px;
  overflow: hidden;
}

.analysis-switch-thumb {
  position: absolute;
  left: 3px;
  top: 3px;
  width: calc((100% - 6px) / var(--analysis-count));
  height: calc(100% - 6px);
  border-radius: 10px;
  background: linear-gradient(135deg, #4f46ff 0%, #2558ff 100%);
  box-shadow: 0 8px 16px rgba(79, 70, 255, 0.22);
  transform: translateX(calc(var(--analysis-index) * 100%));
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s ease;
}

.analysis-switch-item {
  position: relative;
  z-index: 1;
  height: 30px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--brand-text-normal);
  font-size: 14px;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.analysis-switch-item:hover {
  color: var(--brand-primary);
}

.analysis-switch-item.is-active {
  color: #ffffff;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.kpi-card {
  cursor: pointer;
  border: 1px solid var(--card-border);
  box-sizing: border-box;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  min-height: 136px;
  border-radius: 16px;
}

.kpi-card :deep(.el-card__body) {
  padding: 18px 22px;
}

.kpi-card:hover {
  border-color: #c3cde0;
  box-shadow: 0 6px 14px rgba(15, 33, 71, 0.08);
}

.kpi-card.is-active {
  border-color: var(--brand-primary);
  background: #f8f8ff;
  box-shadow: 0 8px 18px rgba(79, 70, 255, 0.12);
}

.kpi-row {
  margin-bottom: 12px;
}

.kpi-head {
  margin-bottom: 8px;
}

.kpi-label {
  color: var(--brand-text-normal);
  font-size: 16px;
  font-weight: 600;
}

.kpi-value {
  display: block;
  margin-bottom: 6px;
  font-size: 48px;
  font-weight: 800;
  color: var(--brand-text-strong);
  line-height: 1.05;
}

.kpi-trend-tag {
  border: none;
  height: 28px;
  padding: 0 10px;
  font-size: 14px;
  font-weight: 700;
}

.kpi-trend-tag.is-up {
  color: var(--brand-success);
  background: #e8f7f1;
}

.kpi-trend-tag.is-down {
  color: var(--brand-danger);
  background: #ffecef;
}

.kpi-trend-tag.is-flat {
  color: #6b7e9f;
  background: #eef2f8;
}

.panel-card {
  height: 100%;
}

.panel-card.is-active {
  border-color: var(--brand-primary);
  box-shadow: 0 10px 24px rgba(79, 70, 255, 0.14);
}

.detail-card {
  margin-top: 12px;
}

.panel-head {
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-head-wrap {
  align-items: flex-start;
}

.efficiency-head-grid {
  width: 100%;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
}

.conversion-head-grid {
  width: 100%;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
}

.quality-head-grid {
  width: 100%;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
}

.cost-head-grid {
  width: 100%;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
}

.head-title-left {
  justify-self: start;
}

.efficiency-center-legend {
  justify-self: center;
  flex-wrap: nowrap;
  justify-content: center;
}

.conversion-center-legend {
  justify-self: center;
  flex-wrap: nowrap;
  justify-content: center;
}

.quality-center-legend {
  justify-self: center;
  flex-wrap: nowrap;
  justify-content: center;
}

.cost-center-legend {
  justify-self: center;
  flex-wrap: nowrap;
  justify-content: center;
}

.head-right-spacer {
  justify-self: end;
}

.head-right-metric {
  justify-self: end;
  white-space: nowrap;
}

.dashboard-main {
  width: 100%;
  position: relative;
}

.dashboard-content {
  transition: filter 0.2s ease, opacity 0.2s ease;
}

.dashboard-content.is-switching {
  filter: blur(1.6px);
  opacity: 0.92;
}

.dashboard-content :deep(.el-card) {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.dashboard-content.is-switching :deep(.el-card) {
  transform: translateY(1px);
}

.dashboard-content.is-switching :deep(canvas) {
  transition: opacity 0.2s ease;
}

.dashboard-content.is-switching :deep(canvas) {
  opacity: 0.88;
}

.switching-mask {
  position: absolute;
  inset: 0;
  z-index: 12;
  background: rgba(243, 246, 251, 0.32);
  backdrop-filter: blur(1px);
}

.switch-fade-enter-active,
.switch-fade-leave-active {
  transition: opacity 0.2s ease;
}

.switch-fade-enter-from,
.switch-fade-leave-to {
  opacity: 0;
}

.conversion-head-right {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
}

.conversion-head-right :deep(.el-space__item) {
  display: inline-flex;
  align-items: center;
}

.chart-legend {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.conversion-legend {
  flex-wrap: nowrap;
}

.chart-legend-wrap {
  justify-content: flex-end;
  max-width: 72%;
}

.chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--brand-text-normal);
  white-space: nowrap;
}

.chart-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
  background: #909399;
}

.legend-total {
  background: #94a3b8;
}

.legend-proof {
  background: #6366f1;
}

.legend-audit {
  background: #10b981;
}

.legend-person-cost {
  background: #f59e0b;
}

.legend-submit {
  background: #10b981;
}

.legend-reject {
  background: #f43f5e;
}

.legend-radar {
  background: #5745ff;
}

.legend-cost {
  background: #6366f1;
}

.legend-cs-time {
  background: #0ea5e9;
}

.legend-ops-time {
  background: #f59e0b;
}

.kpi-inline {
  font-size: 18px;
  font-weight: 700;
}

.panel-rate-text {
  color: #6b7f9f;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.panel-rate-value {
  color: #0a9d76;
  font-size: 17px;
  font-weight: 800;
  margin-left: 4px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #606266;
  font-size: 12px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}

.legend-email {
  background: #3b82f6;
}

.legend-file {
  background: #f59e0b;
}

.legend-stage-source {
  background: #7c83ff;
}

.legend-stage-create {
  background: #4f7df2;
}

.legend-stage-transfer {
  background: #42b8d5;
}

.legend-stage-submit {
  background: #4cbf88;
}

.conversion-click-tip {
  margin-top: 6px;
  display: inline-block;
}

.conversion-stage-summary {
  margin-top: 8px;
  padding: 8px 0 0;
  border-top: 1px dashed #e5e7eb;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.conversion-stage-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
}

.conversion-stage-value {
  color: var(--brand-text-strong);
  font-size: 18px;
  font-weight: 700;
}

.funnel-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.funnel-row {
  display: grid;
  grid-template-columns: 120px 1fr 84px;
  gap: 8px;
  align-items: center;
}

.funnel-label {
  color: var(--brand-text-normal);
  font-size: 14px;
  font-weight: 600;
}

.funnel-track {
  height: 18px;
  background: #eef2ff;
  border-radius: 999px;
  overflow: hidden;
}

.funnel-fill {
  height: 100%;
  display: flex;
  border-radius: 999px;
  overflow: hidden;
}

.funnel-segment {
  height: 100%;
}

.funnel-email {
  background: #3b82f6;
}

.funnel-file {
  background: #f59e0b;
}

.funnel-value {
  text-align: right;
  color: var(--brand-text-strong);
  font-size: 16px;
  font-weight: 700;
}

.miss-rate {
  font-weight: 700;
  color: var(--brand-danger);
  font-size: 20px;
}

.miss-summary-box {
  border: 1px solid #ffd0dc;
  background: #fff2f6;
  border-radius: 16px;
  padding: 14px 16px;
}

.miss-summary-label {
  font-size: 15px;
  color: #e32558;
  font-weight: 600;
}

.miss-summary-value {
  font-size: 48px;
  color: #e41452;
  font-weight: 700;
  line-height: 1;
}

.miss-chart-wrap {
  width: 100%;
}

.miss-panel-stack {
  width: 100%;
  display: flex !important;
}

.miss-panel-stack :deep(.el-space__item) {
  width: 100%;
}

.miss-legend-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.miss-legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #374151;
}

.miss-legend-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.miss-legend-ratio {
  color: #111827;
  font-weight: 600;
  font-size: 14px;
}

.reason-card {
  height: 100%;
  padding: 8px;
  border-radius: 4px;
  background: #fafafa;
  border: 1px solid #ebeef5;
}

.reason-name {
  display: block;
  color: #17181a;
}

.reason-ratio {
  display: block;
  margin: 4px 0;
  font-size: 12px;
}

.reason-progress {
  width: 100%;
  height: 6px;
  background: #ebeef5;
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 4px;
}

.reason-progress-fill {
  display: block;
  height: 100%;
}

.reason-color-1 {
  background: #ef4444;
}

.reason-color-2 {
  background: #f59e0b;
}

.reason-color-3 {
  background: #6366f1;
}


.metric-grid {
  margin-top: 12px;
}

.metric-box {
  height: 100%;
  padding: 10px;
  border-radius: 4px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mini-table {
  margin-top: 12px;
}

.contribution-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contribution-row {
  display: grid;
  grid-template-columns: 80px 1fr 44px;
  align-items: center;
  gap: 8px;
}

.contribution-name {
  color: #606266;
}

.contribution-track {
  height: 8px;
  border-radius: 99px;
  background: #ebeef5;
  overflow: hidden;
}

.contribution-fill {
  display: block;
  height: 100%;
}

.contribution-value {
  text-align: right;
}

.quality-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quality-row {
  padding: 10px;
  border-radius: 4px;
  background: #fafafa;
  border: 1px solid #ebeef5;
}

.quality-inline-metrics {
  margin-top: 6px;
}

.quality-inline-box {
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-card {
  height: 184px;
  min-height: 184px;
  border-radius: 8px;
  overflow: hidden;
}

.metric-card :deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 12px 16px 14px;
}

.metric-card-basic :deep(.el-card__body) {
  align-items: flex-start;
  text-align: left;
}

.metric-card-rate :deep(.el-card__body) {
  align-items: stretch;
  padding: 12px 16px;
}

.metric-card-rate-merged :deep(.el-card__body) {
  justify-content: flex-start;
}

.metric-card-split :deep(.el-card__body) {
  width: 100%;
}

.metric-split {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.metric-main {
  min-width: 0;
  text-align: left;
}

.metric-main .metric-value {
  text-align: left;
}

.metric-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  min-width: 96px;
  padding-top: 2px;
}

.processing-side {
  flex: 1;
  min-width: 0;
  align-items: flex-end;
  gap: 5px;
  padding-top: 0;
}

.processing-side .metric-side-item {
  align-self: flex-end;
  text-align: right;
}

.processing-metric-main {
  flex: 0 0 118px;
  min-width: 118px;
}

.metric-side-item {
  line-height: 1.2;
  white-space: nowrap;
}

.rate-card-layout {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
}

.rate-card-stack {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 12px;
}

.rate-card-title {
  display: block;
  width: 100%;
  text-align: left;
  align-self: flex-start;
}

.efficiency-inline-note {
  font-weight: 700;
}

.rate-card-main {
  min-width: 140px;
  flex: 0 0 140px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding-top: 2px;
}

.rate-merged-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.rate-merged-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 118px;
}

.rate-main-title {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  text-align: left;
  color: var(--brand-text-light);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.2;
  letter-spacing: 0;
}

.metric-card-head {
  margin-bottom: 8px;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: flex-start;
}

.rate-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 4px;
  flex-shrink: 0;
  align-self: flex-start;
}

.metric-value {
  display: block;
  margin-top: 0;
  font-size: 26px;
  color: var(--brand-text-strong);
  font-weight: 700;
  line-height: 1.15;
}

.metric-value-row {
  width: 100%;
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 0;
  white-space: nowrap;
}

.metric-value-compact {
  display: inline-block;
  margin: 0;
  line-height: 1;
}

.metric-unit {
  margin-left: 0;
  display: inline-block;
  font-size: 20px;
  color: #8a90a0;
  line-height: 1;
  font-weight: 500;
  transform: translateY(-1px);
}

.detail-toolbar {
  margin-bottom: 12px;
}

.section-anchor {
  width: 100%;
}

.title-line {
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: var(--brand-primary);
}

.search-input {
  width: 280px;
}

.id-text {
  font-family: Consolas, Monaco, monospace;
}

.source-pill {
  --el-tag-border-color: transparent;
  border: none;
  border-radius: 6px;
  font-weight: 700;
  padding: 0 8px;
}

.quality-source-pill {
  --el-tag-border-color: transparent;
  border: none;
  border-radius: 999px;
  font-weight: 600;
  padding: 0 10px;
}

.source-email {
  background: #eef3ff;
  color: #2f5fff;
}

.source-file {
  background: #fff4e6;
  color: #d97706;
}

.source-unknown {
  background: #f1f5f9;
  color: #64748b;
}

.status-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.status-success {
  color: #059669;
}

.status-success .status-dot {
  background: #10b981;
}

.status-failed {
  color: #e11d48;
}

.status-failed .status-dot {
  background: #f43f5e;
}

.total-time-text {
  color: #4f46ff;
  font-size: inherit;
  font-weight: 800;
}

.rework-count-text {
  font-size: inherit;
  font-weight: 800;
}

.rework-count-text.is-positive {
  color: #e11d48;
}

.rework-count-text.is-zero {
  color: #94a3b8;
}

.accuracy-rate-text {
  color: #059669;
  font-size: inherit;
  font-weight: 800;
}

.processing-cost-text {
  color: #e11d48;
  font-size: inherit;
  font-weight: 800;
}

.saved-cost-text {
  color: #059669;
  font-size: inherit;
  font-weight: 800;
}

.duration-inline {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

.duration-hour-inline {
  margin-left: 2px;
  color: #909399;
  font-size: 12px;
}

.detail-table {
  width: 100%;
}

.detail-table :deep(.el-button.is-link) {
  color: var(--brand-primary);
  font-weight: 600;
}

.detail-table :deep(.el-button.is-link:hover),
.detail-table :deep(.el-button.is-link:focus-visible) {
  color: var(--brand-primary-hover);
}

.detail-table :deep(.el-button.is-link .el-icon) {
  color: inherit;
}

.pager-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.pager-wrap :deep(.el-pagination.is-background .el-pager li.is-active) {
  background-color: var(--brand-primary);
}

.email-detail-layout {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.email-meta-card :deep(.el-card__body),
.email-body-card :deep(.el-card__body),
.email-attachments-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.email-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.email-subject-wrap {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.email-subject-text {
  min-width: 0;
  font-size: 26px;
  line-height: 1.25;
  color: var(--brand-text-strong);
  overflow-wrap: anywhere;
}

.email-address-row {
  margin-top: 6px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.email-address-label {
  width: 44px;
  flex: 0 0 44px;
  color: #909399;
}

.email-address-value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.email-body-text {
  display: block;
  width: 100%;
  white-space: pre-wrap;
  line-height: 1.8;
  color: var(--brand-text-secondary);
}

.email-attachments-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.file-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-row {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--card-border);
  background: #fafafa;
}

.file-icon {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: #e6f7ff;
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-name-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.file-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.business-detail-space {
  width: 100%;
}

.business-detail-space :deep(.el-space__item) {
  width: 100%;
}

.business-detail-space :deep(.el-card),
.business-detail-space :deep(.el-descriptions) {
  width: 100%;
}

.dialog-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preview-wrap {
  max-height: 72vh;
  overflow: auto;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.preview-table td {
  border: 1px solid #ebeef5;
  padding: 8px 10px;
  vertical-align: top;
}

.preview-key {
  width: 140px;
  background: #f8f9fb;
  color: #606266;
}

.flow-table,
.quality-detail-table {
  margin-top: 10px;
}

.field-accuracy-table {
  margin-top: 4px;
}

.field-accuracy-table :deep(.el-table__body-wrapper) {
  overflow-y: auto;
}

.field-accuracy-idp {
  color: #4f46ff;
  font-size: 15px;
  font-weight: 700;
}

.field-accuracy-mail {
  color: #059669;
  font-size: 15px;
  font-weight: 700;
}

:deep(.el-button--primary) {
  --el-button-bg-color: var(--brand-primary);
  --el-button-border-color: var(--brand-primary);
  --el-button-hover-bg-color: var(--brand-primary-hover);
  --el-button-hover-border-color: var(--brand-primary-hover);
  --el-button-active-bg-color: #4338ca;
  --el-button-active-border-color: #4338ca;
}

:deep(.el-button--primary.el-button) {
  border-radius: 10px;
  height: 38px;
  font-weight: 700;
}

:deep(.el-picker__popper),
:deep(.el-cascader__dropdown) {
  --el-color-primary: var(--brand-primary);
}

:deep(.top-filter-popper) {
  --el-color-primary: var(--brand-primary) !important;
}

:deep(.top-filter-popper.el-select-dropdown .el-select-dropdown__item.is-selected) {
  color: var(--brand-primary) !important;
  font-weight: 700;
  background-color: rgba(79, 70, 255, 0.1) !important;
}

:deep(.top-filter-popper.el-select-dropdown .el-select-dropdown__item:hover),
:deep(.top-filter-popper.el-select-dropdown .el-select-dropdown__item.hover) {
  background-color: rgba(79, 70, 255, 0.08) !important;
}

:deep(.top-filter-popper.el-cascader__dropdown .el-radio__inner) {
  border-color: var(--brand-primary) !important;
}

:deep(.top-filter-popper.el-cascader__dropdown .el-radio__input.is-checked .el-radio__inner) {
  background-color: var(--brand-primary) !important;
  border-color: var(--brand-primary) !important;
}

:deep(.top-filter-popper.el-cascader__dropdown .el-cascader-node.is-active) {
  background-color: rgba(79, 70, 255, 0.1) !important;
}

:deep(.el-date-picker__header-label:hover),
:deep(.el-picker-panel__shortcut:hover),
:deep(.el-time-panel__btn.confirm) {
  color: var(--brand-primary);
}

:deep(.el-date-table td.current:not(.disabled) .el-date-table-cell__text),
:deep(.el-date-table td.start-date .el-date-table-cell__text),
:deep(.el-date-table td.end-date .el-date-table-cell__text) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #ffffff;
  box-shadow: 0 0 0 1px var(--brand-primary) inset;
}

:deep(.el-date-table td.available:hover .el-date-table-cell__text) {
  color: var(--brand-primary);
}

:deep(.el-date-table td.in-range .el-date-table-cell) {
  background-color: rgba(79, 70, 255, 0.14);
}

:deep(.el-date-table td.in-range .el-date-table-cell__text) {
  color: var(--brand-primary);
}

:deep(.el-date-table td.today .el-date-table-cell__text) {
  color: var(--brand-primary);
}

:deep(.el-cascader-node.in-active-path),
:deep(.el-cascader-node.is-active),
:deep(.el-cascader-node.is-selectable.in-checked-path) {
  color: var(--brand-primary);
}

:deep(.el-cascader__dropdown .el-cascader-node.is-active) {
  background-color: rgba(79, 70, 255, 0.1);
}

:deep(.el-cascader__dropdown .el-radio__inner) {
  border-color: #c5ccdb;
}

:deep(.el-cascader__dropdown .el-radio__input.is-checked .el-radio__inner) {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
}

:deep(.el-cascader__dropdown .el-radio__input.is-checked + .el-radio__label) {
  color: var(--brand-primary);
  font-weight: 600;
}

</style>


