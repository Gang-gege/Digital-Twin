<script setup lang="ts">
import { computed, ref } from 'vue';
import { buildingShares, DEVICE_TYPES, PIPE_LEGEND, STATUS_LEGEND } from '../mock/parkData';
import type {
  AlarmFilter,
  AlarmRecord,
  DeviceType,
  LayerName,
  LayerState,
  PanelTab,
  ParkStats,
  Viewpoint,
} from '../types/park';
import ChartBoard from './ChartBoard.vue';

const props = defineProps<{
  tab: PanelTab;
  stats: ParkStats;
  alarms: AlarmRecord[];
  alarmFilter: AlarmFilter;
  typeFilter: 'all' | DeviceType;
  layers: LayerState;
  customModel: boolean;
  bookmarks: Viewpoint[];
}>();

const emit = defineEmits<{
  layer: [payload: { name: LayerName; visible: boolean }];
  filter: [filter: AlarmFilter];
  type: [type: 'all' | DeviceType];
  focus: [id: string];
  clear: [];
  reset: [];
  'load-model': [file: File];
  restore: [];
  'save-mark': [name: string];
  'fly-mark': [mark: Viewpoint];
  'drop-mark': [id: string];
}>();

const markName = ref('');
const shares = buildingShares();
const layersItems: Array<[LayerName, string]> = [
  ['building', '厂房建筑'],
  ['wall', '围墙'],
  ['device', '设备'],
  ['pipe', '地下管网'],
  ['alarm', '告警光效'],
  ['flyline', '飞线'],
  ['forklift', '叉车'],
  ['hazard', '危化区'],
  ['measure', '测量标注'],
  ['grid', '地面网格'],
];

const shown = computed(() => props.alarms.filter((item) => {
  if (props.alarmFilter !== 'all' && item.level !== props.alarmFilter) return false;
  if (props.typeFilter !== 'all' && item.deviceType !== props.typeFilter) return false;
  return true;
}));

function onType(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('type', value === 'all' ? 'all' : value as DeviceType);
}

function onFile(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (file) emit('load-model', file);
  input.value = '';
}

function saveMark() {
  const name = markName.value.trim();
  if (!name) return;
  emit('save-mark', name);
  markName.value = '';
}
</script>

<template>
  <aside class="side">
    <section v-if="tab === 'board'" class="pad">
      <h2>运行统计</h2>
      <div class="stats">
        <div><b>{{ stats.total }}</b><span>设备</span></div>
        <div><b class="ok">{{ stats.online }}</b><span>在线</span></div>
        <div><b class="muted">{{ stats.offline }}</b><span>离线</span></div>
        <div><b class="info">{{ stats.info }}</b><span>提示</span></div>
        <div><b class="warn">{{ stats.warning }}</b><span>预警</span></div>
        <div><b class="urgent">{{ stats.urgent }}</b><span>紧急</span></div>
      </div>
    </section>
    <section v-if="tab === 'board'" class="pad">
      <h2>厂房占比 / 告警等级</h2>
      <ChartBoard :stats="stats" :shares="shares" />
    </section>

    <section v-else-if="tab === 'layers'" class="pad">
      <h2>图层</h2>
      <div class="switches">
        <button
          v-for="[key, label] in layersItems"
          :key="key"
          class="switch"
          :class="{ on: layers[key] }"
          @click="emit('layer', { name: key, visible: !layers[key] })"
        >
          <span>{{ label }}</span>
          <i />
        </button>
      </div>
      <div class="legend-row" v-for="item in PIPE_LEGEND" :key="item.name">
        <i :style="{ background: item.color }" />{{ item.name }}
      </div>
      <div class="presets" style="margin-top: 12px">
        <label class="file-btn">
          替换选中厂房
          <input type="file" accept=".glb,.gltf,model/gltf-binary" hidden @change="onFile" />
        </label>
        <button :disabled="!customModel" @click="emit('restore')">恢复白模</button>
      </div>
    </section>

    <section v-else-if="tab === 'alarms'" class="pad">
      <h2>告警列表</h2>
      <div class="chips">
        <button :class="{ on: alarmFilter === 'all' }" @click="emit('filter', 'all')">全部</button>
        <button :class="{ on: alarmFilter === 'info' }" @click="emit('filter', 'info')">提示</button>
        <button :class="{ on: alarmFilter === 'warning' }" @click="emit('filter', 'warning')">预警</button>
        <button :class="{ on: alarmFilter === 'urgent' }" @click="emit('filter', 'urgent')">紧急</button>
      </div>
      <select :value="typeFilter" style="margin: 8px 0; width: 100%; padding: 6px" @change="onType">
        <option value="all">全部类型</option>
        <option v-for="(meta, key) in DEVICE_TYPES" :key="key" :value="key">{{ meta.label }}</option>
      </select>
      <div class="chips">
        <button @click="emit('clear')">清除告警</button>
        <button @click="emit('reset')">重置设备</button>
      </div>
      <div class="alarm-list" style="margin-top: 10px">
        <p v-if="!shown.length" class="empty">当前筛选下没有告警</p>
        <button v-for="item in shown" :key="item.id" class="alarm-item" :class="item.level" @click="emit('focus', item.deviceId)">
          <i />
          <span>
            <b>{{ item.deviceName }}</b>
            <em>{{ item.typeLabel }} · {{ item.message }}</em>
          </span>
          <time>{{ item.timeText }}</time>
        </button>
      </div>
    </section>

    <section v-else-if="tab === 'bookmarks'" class="pad">
      <h2>视角书签</h2>
      <div class="bookmark-form">
        <input v-model="markName" type="text" maxlength="16" placeholder="书签名称" @keyup.enter="saveMark" />
        <button @click="saveMark">保存</button>
      </div>
      <div class="mark-list" style="margin-top: 10px">
        <p v-if="!bookmarks.length" class="empty">还没有书签。对准场景后保存当前视角。</p>
        <button v-for="mark in bookmarks" :key="mark.id" @click="emit('fly-mark', mark)">
          <span>{{ mark.name }}</span>
          <em @click.stop="emit('drop-mark', mark.id)">删除</em>
        </button>
      </div>
    </section>

    <section v-else class="pad">
      <h2>图例</h2>
      <div class="legend-row" v-for="item in STATUS_LEGEND" :key="item.name">
        <i :style="{ background: item.color }" />{{ item.name }}
      </div>
      <h2 style="margin-top: 14px">管线</h2>
      <div class="legend-row" v-for="item in PIPE_LEGEND" :key="item.name">
        <i :style="{ background: item.color }" />{{ item.name }}
      </div>
      <p class="empty">厂房按用途着色。夜晚生产、水务、电力和危化车间的窗户会点亮。</p>
    </section>
  </aside>
</template>
