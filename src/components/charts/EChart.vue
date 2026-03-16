<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components';
import type { EChartsOption } from 'echarts';

echarts.use([
  CanvasRenderer,
  DatasetComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  RadarComponent,
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  RadarChart
]);

const props = withDefaults(
  defineProps<{
    option: EChartsOption;
    height?: string;
    active?: boolean;
  }>(),
  {
    height: '320px',
    active: true
  }
);

const emit = defineEmits<{
  (e: 'chart-click', params: unknown): void;
}>();

const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;
let resizeTimer: number | null = null;
let removeWindowResize: (() => void) | null = null;

const doResize = (retry = 0) => {
  if (!chart || !chartEl.value) return;
  chart.resize();

  const { clientWidth, clientHeight } = chartEl.value;
  if ((clientWidth === 0 || clientHeight === 0) && retry < 8) {
    if (resizeTimer !== null) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(() => doResize(retry + 1), 90);
  }
};

const render = () => {
  if (!chartEl.value) return;
  if (!chart) {
    chart = echarts.init(chartEl.value);
    chart.on('click', (params) => {
      emit('chart-click', params);
    });
  }
  chart.setOption(props.option, true);
  doResize();
};

onMounted(() => {
  nextTick(() => {
    render();
  });

  const onWindowResize = () => doResize();
  window.addEventListener('resize', onWindowResize);
  removeWindowResize = () => window.removeEventListener('resize', onWindowResize);

  if (chartEl.value) {
    observer = new ResizeObserver(() => {
      doResize();
    });
    observer.observe(chartEl.value);
  }
});

watch(
  () => props.option,
  () => {
    render();
  },
  { deep: true }
);

watch(
  () => props.active,
  (active) => {
    if (!active) return;
    nextTick(() => {
      render();
      doResize();
    });
  }
);

onBeforeUnmount(() => {
  if (resizeTimer !== null) {
    window.clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  removeWindowResize?.();
  removeWindowResize = null;
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="chartEl" class="chart" :style="{ height }"></div>
</template>

<style scoped>
.chart {
  width: 100%;
}
</style>
