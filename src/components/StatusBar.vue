<script setup lang="ts">
import { computed } from 'vue';
import type { PointerInfo, ViewInfo } from '../types/park';

const props = defineProps<{
  view: ViewInfo;
  pointer: PointerInfo;
  alarmCount: number;
  clock: string;
}>();

const lnglat = computed(() => {
  if (props.pointer.lng == null || props.pointer.lat == null) return '鼠标移入地图后显示坐标';
  return `${props.pointer.lng.toFixed(6)}, ${props.pointer.lat.toFixed(6)}`;
});

const local = computed(() => {
  if (props.pointer.east == null || props.pointer.north == null) return '--';
  return `东 ${props.pointer.east.toFixed(1)} m · 北 ${props.pointer.north.toFixed(1)} m`;
});

function num(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(digits);
}
</script>

<template>
  <footer class="status-bar">
    <span class="hover">{{ pointer.hover || '星澜智慧园区 · GCJ-02' }}</span>
    <span>{{ lnglat }}</span>
    <span>{{ local }}</span>
    <span>缩放 {{ num(view.zoom, 1) }}</span>
    <span>俯仰 {{ num(view.pitch, 0) }}°</span>
    <span>旋转 {{ num(view.rotation, 0) }}°</span>
    <span>LOD {{ view.lod }}</span>
    <span :class="{ bad: alarmCount > 0 }">告警 {{ alarmCount }}</span>
    <time>{{ clock }}</time>
  </footer>
</template>
