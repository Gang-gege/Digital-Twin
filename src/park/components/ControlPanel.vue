<script setup lang="ts">
import { computed } from 'vue';
import { PIPE_LEGEND } from '../mock/parkData';
import type {
  AlarmFilter,
  AlarmRecord,
  LayerName,
  LayerState,
  MeasureMode,
  ParkStats,
  PresetName,
  RoamMode,
  SceneMode,
  TimeMode,
} from '../types/park';

const props = defineProps<{
  collapsed: boolean;
  stats: ParkStats;
  alarms: AlarmRecord[];
  alarmFilter: AlarmFilter;
  layers: LayerState;
  mode: SceneMode;
  customModel: boolean;
}>();

const emit = defineEmits<{
  collapse: [];
  layer: [payload: { name: LayerName; visible: boolean }];
  preset: [name: PresetName];
  'reset-view': [];
  roam: [mode: RoamMode];
  'auto-rotate': [enabled: boolean];
  measure: [mode: MeasureMode];
  'clear-measure': [];
  box: [enabled: boolean];
  time: [mode: TimeMode];
  'clear-alarms': [];
  'reset-devices': [];
  filter: [filter: AlarmFilter];
  'focus-alarm': [deviceId: string];
  'load-model': [file: File];
  'restore-model': [];
  leave: [];
}>();

const onlineRate = computed(() => {
  if (!props.stats.total) return 0;
  return Math.round((props.stats.online / props.stats.total) * 100);
});

const shownAlarms = computed(() => {
  if (props.alarmFilter === 'all') return props.alarms;
  return props.alarms.filter((item) => item.level === props.alarmFilter);
});

const filterCount = computed(() => ({
  all: props.alarms.length,
  warning: props.alarms.filter((item) => item.level === 'warning').length,
  alarm: props.alarms.filter((item) => item.level === 'alarm').length,
}));

const layerItems: Array<[LayerName, string]> = [
  ['building', '建筑层'],
  ['device', '设备层'],
  ['pipe', '管网层'],
  ['alarm', '告警层'],
  ['flyline', '飞线'],
  ['heat', '人流热力'],
  ['measure', '测量标注'],
];

function onFile(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (file) emit('load-model', file);
  input.value = '';
}
</script>

<template>
  <aside class="panel" :class="{ 'is-collapsed': collapsed }">
    <header class="brand">
      <div>
        <p>SMART PARK</p>
        <h1>星澜智慧园区</h1>
      </div>
      <div class="brand-actions">
        <button class="back" type="button" @click="emit('leave')">返回</button>
        <button class="icon-btn" title="收起面板" @click="emit('collapse')">〈</button>
      </div>
    </header>

    <section class="block">
      <div class="stat-grid">
        <div>
          <b>{{ stats.total }}</b>
          <span>设备总数</span>
        </div>
        <div>
          <b class="ok">{{ stats.online }}</b>
          <span>在线</span>
        </div>
        <div>
          <b class="muted">{{ stats.offline }}</b>
          <span>离线</span>
        </div>
        <div :class="{ alert: stats.warning + stats.alarm > 0 }">
          <b class="bad">{{ stats.warning + stats.alarm }}</b>
          <span>告警</span>
        </div>
      </div>
      <div class="meter">
        <div class="meter-label">
          <span>在线率 {{ onlineRate }}%</span>
          <span>预警 {{ stats.warning }} · 告警 {{ stats.alarm }}</span>
        </div>
        <div class="meter-track"><i :style="{ width: `${onlineRate}%` }" /></div>
      </div>
    </section>

    <section class="block">
      <h2>图层</h2>
      <div class="switch-list">
        <button
          v-for="[key, label] in layerItems"
          :key="key"
          class="switch"
          :class="{ on: layers[key] }"
          @click="emit('layer', { name: key, visible: !layers[key] })"
        >
          <span>{{ label }}</span>
          <i />
        </button>
      </div>
      <div class="legend">
        <span v-for="item in PIPE_LEGEND" :key="item.name">
          <i :style="{ background: item.color }" />{{ item.name }}
        </span>
      </div>
    </section>

    <section class="block">
      <h2>视角与工具</h2>
      <div class="btn-grid">
        <button :class="{ on: false }" @click="emit('preset', 'global')">全局</button>
        <button @click="emit('preset', 'building')">重点楼栋</button>
        <button @click="emit('preset', 'gate')">出入口</button>
        <button @click="emit('reset-view')">复位</button>
      </div>
      <div class="btn-grid two">
        <button :class="{ on: mode.roamMode === 'free' }" @click="emit('roam', 'free')">自由漫游</button>
        <button :class="{ on: mode.roamMode === 'fps' }" @click="emit('roam', 'fps')">第一人称</button>
        <button :class="{ on: mode.autoRotate }" @click="emit('auto-rotate', !mode.autoRotate)">自动环视</button>
        <button :class="{ on: mode.boxMode }" @click="emit('box', !mode.boxMode)">框选设备</button>
      </div>
      <div class="btn-grid">
        <button :class="{ on: mode.measureMode === 'distance' }" @click="emit('measure', mode.measureMode === 'distance' ? 'none' : 'distance')">测距</button>
        <button :class="{ on: mode.measureMode === 'area' }" @click="emit('measure', mode.measureMode === 'area' ? 'none' : 'area')">测面积</button>
        <button :class="{ on: mode.measureMode === 'elevation' }" @click="emit('measure', mode.measureMode === 'elevation' ? 'none' : 'elevation')">标高</button>
        <button @click="emit('clear-measure')">清除标注</button>
      </div>
      <div class="btn-grid two">
        <button :class="{ on: mode.timeMode === 'day' }" @click="emit('time', 'day')">白天</button>
        <button :class="{ on: mode.timeMode === 'night' }" @click="emit('time', 'night')">夜晚</button>
        <button @click="emit('clear-alarms')">清除告警</button>
        <button @click="emit('reset-devices')">重置设备</button>
      </div>
      <div class="btn-grid two">
        <label class="file-btn">
          替换选中建筑
          <input type="file" accept=".glb,.gltf,model/gltf-binary" hidden @change="onFile" />
        </label>
        <button :disabled="!customModel" @click="emit('restore-model')">恢复白模</button>
      </div>
    </section>

    <section class="block alarm-block">
      <div class="block-head">
        <h2>告警列表</h2>
        <div class="chips">
          <button :class="{ on: alarmFilter === 'all' }" @click="emit('filter', 'all')">全部 {{ filterCount.all }}</button>
          <button :class="{ on: alarmFilter === 'warning' }" @click="emit('filter', 'warning')">预警 {{ filterCount.warning }}</button>
          <button :class="{ on: alarmFilter === 'alarm' }" @click="emit('filter', 'alarm')">告警 {{ filterCount.alarm }}</button>
        </div>
      </div>
      <div class="alarm-list">
        <p v-if="!shownAlarms.length" class="empty">当前筛选下没有告警</p>
        <button
          v-for="item in shownAlarms"
          :key="item.id"
          class="alarm-item"
          :class="item.level"
          @click="emit('focus-alarm', item.deviceId)"
        >
          <i />
          <span>
            <b>{{ item.deviceName }}</b>
            <em>{{ item.typeLabel }} · {{ item.message }}</em>
          </span>
          <time>{{ item.timeText }}</time>
        </button>
      </div>
    </section>

    <footer class="hint">
      点击建筑、设备、管线或二维点位可联动定位。快捷键 1/2/3 切视角，0 复位，B 框选，N 昼夜，Esc 退出。
    </footer>
  </aside>
</template>
