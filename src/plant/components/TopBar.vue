<script setup lang="ts">
import type { AlarmRecord, PanelTab } from '../types/park';

defineProps<{
  tab: PanelTab;
  alarms: AlarmRecord[];
}>();

defineEmits<{
  tab: [tab: PanelTab];
  leave: [];
}>();

const menus: Array<[PanelTab, string]> = [
  ['board', '看板'],
  ['layers', '图层'],
  ['alarms', '告警'],
  ['bookmarks', '书签'],
  ['legend', '图例'],
];
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <button class="back" type="button" @click="$emit('leave')">返回</button>
      <p>POWER / WATER</p>
      <strong>澄源工业厂区</strong>
    </div>
    <div class="ticker">
      <span>
        <em v-if="!alarms.length">当前没有告警</em>
        <em v-for="item in alarms.slice(0, 8)" :key="item.id" :class="item.level">
          {{ item.typeLabel }} {{ item.deviceName }} · {{ item.message }}
        </em>
      </span>
    </div>
    <nav class="menus">
      <button
        v-for="[key, label] in menus"
        :key="key"
        :class="{ on: tab === key }"
        @click="$emit('tab', key)"
      >
        {{ label }}
      </button>
    </nav>
  </header>
</template>
