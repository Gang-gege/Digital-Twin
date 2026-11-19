<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import './styles/park.scss';
import ControlPanel from './components/ControlPanel.vue';
import InfoPanel from './components/InfoPanel.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import StatusBar from './components/StatusBar.vue';
import { MapScene } from './core/MapScene';
import type {
  AlarmFilter,
  AlarmRecord,
  LayerName,
  LayerState,
  ParkStats,
  PointerInfo,
  SceneMode,
  SelectionPayload,
  ViewInfo,
} from './types/park';

const emit = defineEmits<{ leave: [] }>();
const mapRef = ref<HTMLElement | null>(null);
const collapsed = ref(false);
const loading = ref(true);
const loadStep = ref(0);
const loadText = ref('正在启动');
const errorText = ref('');
const toast = ref('');
const alarmFilter = ref<AlarmFilter>('all');
const selection = ref<SelectionPayload | null>(null);
const clock = ref('');

const stats = reactive<ParkStats>({ total: 0, online: 0, offline: 0, warning: 0, alarm: 0 });
const alarms = ref<AlarmRecord[]>([]);
const layers = reactive<LayerState>({
  building: true,
  device: true,
  pipe: true,
  alarm: true,
  flyline: true,
  heat: false,
  measure: true,
});
const mode = reactive<SceneMode>({
  roamMode: 'free',
  measureMode: 'none',
  boxMode: false,
  autoRotate: false,
  timeMode: 'day',
  measureHint: '',
});
const view = reactive<ViewInfo>({ zoom: 16.6, pitch: 54, rotation: -28, lod: '近景精细' });
const pointer = reactive<PointerInfo>({ lng: null, lat: null, east: null, north: null, hover: '' });

const alarmCount = computed(() => stats.warning + stats.alarm);
const customModel = computed(() => Boolean(selection.value?.custom));

let sceneApi: MapScene | null = null;
let toastTimer = 0;
let clockTimer = 0;

function showToast(text: string) {
  toast.value = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
  }, 2600);
}

function tickClock() {
  const date = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  clock.value = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function onParkError(event: Event) {
  const detail = event instanceof CustomEvent ? String(event.detail || '') : '';
  if (!loading.value) showToast(detail || '页面脚本异常');
}

onMounted(async () => {
  tickClock();
  clockTimer = window.setInterval(tickClock, 1000);
  window.addEventListener('park-error', onParkError);
  if (!mapRef.value) return;
  sceneApi = new MapScene(mapRef.value, {
    onLoading: ({ step, text }) => {
      loadStep.value = step;
      loadText.value = text;
    },
    onReady: () => {
      loading.value = false;
    },
    onError: (message) => {
      errorText.value = message;
      loading.value = true;
    },
    onToast: showToast,
    onStats: (next) => Object.assign(stats, next),
    onAlarms: (list) => {
      alarms.value = list;
    },
    onSelect: (payload) => {
      selection.value = payload;
    },
    onPointer: (info) => Object.assign(pointer, info),
    onView: (info) => Object.assign(view, info),
    onMode: (next) => Object.assign(mode, next),
    onLayers: (next) => Object.assign(layers, next),
  });
  await sceneApi.init();
});

onBeforeUnmount(() => {
  window.clearInterval(clockTimer);
  window.clearTimeout(toastTimer);
  window.removeEventListener('park-error', onParkError);
  sceneApi?.dispose();
  sceneApi = null;
});

function layerToggle({ name, visible }: { name: LayerName; visible: boolean }) {
  sceneApi?.setLayer(name, visible);
}
</script>

<template>
  <div class="park-root">
  <div class="app-shell">
    <ControlPanel
      :collapsed="collapsed"
      :stats="stats"
      :alarms="alarms"
      :alarm-filter="alarmFilter"
      :layers="layers"
      :mode="mode"
      :custom-model="customModel"
      @collapse="collapsed = true"
      @layer="layerToggle"
      @preset="sceneApi?.flyPreset($event)"
      @reset-view="sceneApi?.resetView()"
      @roam="sceneApi?.setRoamMode($event)"
      @auto-rotate="sceneApi?.setAutoRotate($event)"
      @measure="sceneApi?.setMeasureMode($event)"
      @clear-measure="sceneApi?.clearMeasure()"
      @box="sceneApi?.setBoxMode($event)"
      @time="sceneApi?.setTimeOfDay($event)"
      @clear-alarms="sceneApi?.clearAlarms()"
      @reset-devices="sceneApi?.resetDevices()"
      @filter="alarmFilter = $event"
      @focus-alarm="sceneApi?.focusAlarm($event)"
      @load-model="sceneApi?.loadModelFile($event)"
      @restore-model="sceneApi?.restoreModel()"
      @leave="emit('leave')"
    />

    <main class="stage">
      <div class="view">
        <div ref="mapRef" class="map-root" />
        <button v-if="collapsed" class="reopen" @click="collapsed = false">面板</button>
        <button v-if="collapsed" class="reopen back-home" @click="emit('leave')">返回</button>
        <InfoPanel :payload="selection" @close="sceneApi?.clearSelection()" @focus="sceneApi?.focusAlarm($event)" />
        <div v-if="mode.roamMode === 'fps'" class="crosshair" />
        <p v-if="mode.roamMode === 'fps'" class="banner">WASD 移动 · 鼠标转向 · Shift 加速 · 滚轮缩放 · Esc 退出</p>
        <p v-else-if="mode.measureHint" class="banner">{{ mode.measureHint }}</p>
        <p v-else-if="mode.boxMode" class="banner">按住左键拖出矩形，框选范围内的设备</p>
      </div>
      <StatusBar :view="view" :pointer="pointer" :alarm-count="alarmCount" :clock="clock" />
    </main>

    <LoadingOverlay :visible="loading" :step="loadStep" :text="loadText" :error="errorText" scene="园区" />
    <p v-if="toast" class="toast">{{ toast }}</p>
  </div>
  </div>
</template>
