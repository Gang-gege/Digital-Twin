<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import './styles/main.scss';
import BottomBar from './components/BottomBar.vue';
import InfoPanel from './components/InfoPanel.vue';
import LoadingOverlay from '../components/LoadingOverlay.vue';
import SidePanel from './components/SidePanel.vue';
import TopBar from './components/TopBar.vue';
import { loadBookmarks, storeBookmarks } from './core/bookmarks';
import { MapScene } from './core/MapScene';
import type {
  AlarmFilter,
  AlarmRecord,
  DeviceType,
  LayerState,
  PanelTab,
  ParkStats,
  PointerInfo,
  SceneMode,
  SelectionPayload,
  ViewInfo,
  Viewpoint,
} from './types/park';

const emit = defineEmits<{ leave: [] }>();
const mapRef = ref<HTMLElement | null>(null);
const tab = ref<PanelTab>('board');
const loading = ref(true);
const loadStep = ref(0);
const loadText = ref('正在启动');
const errorText = ref('');
const toast = ref('');
const note = ref('巡检点');
const alarmFilter = ref<AlarmFilter>('all');
const typeFilter = ref<'all' | DeviceType>('all');
const selection = ref<SelectionPayload | null>(null);
const clock = ref('');
const bookmarks = ref<Viewpoint[]>(loadBookmarks());

const stats = reactive<ParkStats>({ total: 0, online: 0, offline: 0, info: 0, warning: 0, urgent: 0 });
const alarms = ref<AlarmRecord[]>([]);
const layers = reactive<LayerState>({
  building: true,
  wall: true,
  device: true,
  pipe: true,
  alarm: true,
  flyline: true,
  forklift: true,
  measure: true,
  grid: false,
  hazard: true,
});
const mode = reactive<SceneMode>({
  roamMode: 'free',
  measureMode: 'none',
  boxMode: false,
  autoRotate: false,
  timeMode: 'day',
  weather: 'clear',
  pipeGhost: false,
  showGrid: false,
  showRuler: false,
  forkliftSpeed: 1,
  measureHint: '',
});
const view = reactive<ViewInfo>({ zoom: 16.7, pitch: 52, rotation: -24, lod: '近景精细' });
const pointer = reactive<PointerInfo>({ lng: null, lat: null, east: null, north: null, hover: '' });

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
  sceneApi.setAnnotation(note.value);
});

onBeforeUnmount(() => {
  window.clearInterval(clockTimer);
  window.clearTimeout(toastTimer);
  window.removeEventListener('park-error', onParkError);
  sceneApi?.dispose();
  sceneApi = null;
});

function saveMark(name: string) {
  const shot = sceneApi?.captureView();
  if (!shot) return;
  bookmarks.value = [{ id: `V-${Date.now()}`, name, ...shot }, ...bookmarks.value].slice(0, 12);
  storeBookmarks(bookmarks.value);
  showToast(`已保存视角「${name}」`);
}

function dropMark(id: string) {
  bookmarks.value = bookmarks.value.filter((item) => item.id !== id);
  storeBookmarks(bookmarks.value);
}
</script>

<template>
  <div class="plant-root">
  <div class="app">
    <TopBar :tab="tab" :alarms="alarms" @tab="tab = $event" @leave="emit('leave')" />
    <div class="workspace">
      <SidePanel
        :tab="tab"
        :stats="stats"
        :alarms="alarms"
        :alarm-filter="alarmFilter"
        :type-filter="typeFilter"
        :layers="layers"
        :custom-model="customModel"
        :bookmarks="bookmarks"
        @layer="sceneApi?.setLayer($event.name, $event.visible)"
        @filter="alarmFilter = $event"
        @type="typeFilter = $event"
        @focus="sceneApi?.focusAlarm($event)"
        @clear="sceneApi?.clearAlarms()"
        @reset="sceneApi?.resetDevices()"
        @load-model="sceneApi?.loadModelFile($event)"
        @restore="sceneApi?.restoreModel()"
        @save-mark="saveMark"
        @fly-mark="sceneApi?.flyBookmark($event)"
        @drop-mark="dropMark"
      />
      <main class="stage">
        <div ref="mapRef" class="map-root" />
        <InfoPanel :payload="selection" @close="sceneApi?.clearSelection()" @focus="sceneApi?.focusAlarm($event)" />
        <div v-if="mode.roamMode === 'fps'" class="crosshair" />
        <p v-if="mode.roamMode === 'fps'" class="banner">WASD 移动 · 鼠标转向 · Shift 加速 · Esc 退出</p>
        <p v-else-if="mode.measureHint" class="banner">{{ mode.measureHint }}</p>
        <p v-else-if="mode.boxMode" class="banner">按住左键拖出矩形，框选范围内的设备</p>
      </main>
    </div>
    <BottomBar
      :mode="mode"
      :view="view"
      :pointer="pointer"
      :clock="clock"
      :note="note"
      @preset="sceneApi?.flyPreset($event)"
      @reset="sceneApi?.resetView()"
      @roam="sceneApi?.setRoamMode($event)"
      @rotate="sceneApi?.setAutoRotate($event)"
      @box="sceneApi?.setBoxMode($event)"
      @measure="sceneApi?.setMeasureMode($event)"
      @clear-measure="sceneApi?.clearMeasure()"
      @time="sceneApi?.setTimeOfDay($event)"
      @weather="sceneApi?.setWeather($event)"
      @ghost="sceneApi?.setPipeGhost($event)"
      @ruler="sceneApi?.setRuler($event)"
      @grid="sceneApi?.setLayer('grid', !mode.showGrid)"
      @speed="sceneApi?.setForkliftSpeed($event)"
      @note="note = $event; sceneApi?.setAnnotation($event)"
    />
    <LoadingOverlay :visible="loading" :step="loadStep" :text="loadText" :error="errorText" scene="厂区" />
    <p v-if="toast" class="toast">{{ toast }}</p>
  </div>
  </div>
</template>
