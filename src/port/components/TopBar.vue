<script setup lang="ts">
import type { AlarmRecord, PanelTab } from '../types/port';

defineProps<{
  tab: PanelTab;
  alarms: AlarmRecord[];
  playing: boolean;
  speed: number;
  trucks: number;
}>();

defineEmits<{
  tab: [tab: PanelTab];
  leave: [];
}>();

const tabs: Array<{ id: PanelTab; label: string }> = [
  { id: 'board', label: '看板' },
  { id: 'layers', label: '图层' },
  { id: 'alarms', label: '告警' },
  { id: 'legend', label: '图例' },
  { id: 'bookmarks', label: '视角' },
];
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <button class="back" type="button" @click="$emit('leave')">返回</button>
      <div>
        <p>CONTAINER TERMINAL</p>
        <strong>澜港集装箱码头</strong>
      </div>
    </div>
    <div class="ticker">
      <span>
        <em v-if="!alarms.length">当前没有告警</em>
        <em v-for="alarm in alarms" :key="alarm.id" :class="alarm.level">{{ alarm.title }} · {{ alarm.message }}</em>
        <em>仿真 {{ playing ? '运行中' : '已暂停' }} · {{ speed.toFixed(1) }}x · 在港集卡 {{ trucks }}</em>
      </span>
    </div>
    <nav class="menus">
      <button v-for="item in tabs" :key="item.id" type="button" :class="{ on: tab === item.id }" @click="$emit('tab', item.id)">
        {{ item.label }}
      </button>
    </nav>
  </header>
</template>
