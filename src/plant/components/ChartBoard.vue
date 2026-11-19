<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { BuildingShare, ParkStats } from '../types/park';

echarts.use([PieChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{
  stats: ParkStats;
  shares: BuildingShare[];
}>();

const pieEl = ref<HTMLDivElement | null>(null);
const barEl = ref<HTMLDivElement | null>(null);
let pie: echarts.ECharts | null = null;
let bar: echarts.ECharts | null = null;

const muted = '#8aa39a';
const COLORS = ['#e3a008', '#2ec4b6', '#4aa3ff', '#f0b429', '#ff5a62', '#3dbe8c'];

function render() {
  pie?.setOption({
    tooltip: { trigger: 'item' },
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['42%', '64%'],
      center: ['50%', '50%'],
      label: { show: false },
      data: props.shares.map((item, index) => ({
        name: item.usage,
        value: Math.round(item.area),
        itemStyle: { color: COLORS[index % COLORS.length] },
      })),
    }],
  });
  bar?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 28, right: 8, top: 16, bottom: 22 },
    xAxis: {
      type: 'category',
      data: ['提示', '预警', '紧急'],
      axisLabel: { color: muted, fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(150,186,176,0.3)' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(150,186,176,0.15)' } },
    },
    series: [{
      type: 'bar',
      barWidth: 16,
      data: [
        { value: props.stats.info, itemStyle: { color: '#4aa3ff' } },
        { value: props.stats.warning, itemStyle: { color: '#f0b429' } },
        { value: props.stats.urgent, itemStyle: { color: '#ff5a62' } },
      ],
    }],
  });
}

onMounted(() => {
  if (pieEl.value) pie = echarts.init(pieEl.value);
  if (barEl.value) bar = echarts.init(barEl.value);
  render();
});

watch(() => [props.stats, props.shares], render, { deep: true });

onBeforeUnmount(() => {
  pie?.dispose();
  bar?.dispose();
});
</script>

<template>
  <div class="chart-board">
    <div class="charts">
      <div ref="pieEl" />
      <div ref="barEl" />
    </div>
    <div class="chart-legend">
      <span v-for="(item, index) in shares" :key="item.usage">
        <i :style="{ background: COLORS[index % COLORS.length] }" />{{ item.usage }}
      </span>
    </div>
  </div>
</template>
