<script setup lang="ts">
import type { MeasureMode, PointerInfo, PresetName, RoamMode, SceneMode, TimeMode, ViewInfo, WeatherMode } from '../types/park';

defineProps<{
  mode: SceneMode;
  view: ViewInfo;
  pointer: PointerInfo;
  clock: string;
  note: string;
}>();

const emit = defineEmits<{
  preset: [name: PresetName];
  reset: [];
  roam: [mode: RoamMode];
  rotate: [enabled: boolean];
  box: [enabled: boolean];
  measure: [mode: MeasureMode];
  'clear-measure': [];
  time: [mode: TimeMode];
  weather: [mode: WeatherMode];
  ghost: [enabled: boolean];
  ruler: [enabled: boolean];
  grid: [];
  speed: [value: number];
  note: [value: string];
}>();

function toggleMeasure(current: MeasureMode, next: MeasureMode) {
  emit('measure', current === next ? 'none' : next);
}

function onNote(event: Event) {
  emit('note', (event.target as HTMLInputElement).value);
}

function onSpeed(event: Event) {
  emit('speed', Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <footer class="toolbar">
    <div class="tools">
      <button :class="{ on: mode.roamMode === 'free' }" @click="emit('roam', 'free')">轨道</button>
      <button :class="{ on: mode.roamMode === 'fps' }" @click="emit('roam', 'fps')">巡检</button>
      <button :class="{ on: mode.autoRotate }" @click="emit('rotate', !mode.autoRotate)">环视</button>
      <button @click="emit('reset')">复位</button>
      <button @click="emit('preset', 'overview')">总览</button>
      <button @click="emit('preset', 'workshop')">车间</button>
      <button @click="emit('preset', 'hazard')">危化区</button>
      <button @click="emit('preset', 'gate')">出入口</button>
      <button :class="{ on: mode.boxMode }" @click="emit('box', !mode.boxMode)">框选</button>
      <button :class="{ on: mode.measureMode === 'distance' }" @click="toggleMeasure(mode.measureMode, 'distance')">测距</button>
      <button :class="{ on: mode.measureMode === 'area' }" @click="toggleMeasure(mode.measureMode, 'area')">测面积</button>
      <button :class="{ on: mode.measureMode === 'elevation' }" @click="toggleMeasure(mode.measureMode, 'elevation')">标高</button>
      <button :class="{ on: mode.measureMode === 'text' }" @click="toggleMeasure(mode.measureMode, 'text')">文字</button>
      <button @click="emit('clear-measure')">清除标注</button>
      <button :class="{ on: mode.timeMode === 'day' }" @click="emit('time', 'day')">晴昼</button>
      <button :class="{ on: mode.timeMode === 'night' }" @click="emit('time', 'night')">夜晚</button>
      <button :class="{ on: mode.weather === 'clear' }" @click="emit('weather', 'clear')">晴</button>
      <button :class="{ on: mode.weather === 'fog' }" @click="emit('weather', 'fog')">雾</button>
      <button :class="{ on: mode.weather === 'rain' }" @click="emit('weather', 'rain')">雨</button>
      <button :class="{ on: mode.pipeGhost }" @click="emit('ghost', !mode.pipeGhost)">管网透视</button>
      <button :class="{ on: mode.showRuler }" @click="emit('ruler', !mode.showRuler)">标尺</button>
      <button :class="{ on: mode.showGrid }" @click="emit('grid')">网格</button>
    </div>
    <label v-if="mode.measureMode === 'text'" class="bookmark-form">
      <input :value="note" type="text" maxlength="24" placeholder="标注文字" @input="onNote" />
    </label>
    <label class="speed">
      叉车
      <input
        type="range"
        min="0.4"
        max="2"
        step="0.1"
        :value="mode.forkliftSpeed"
        @input="onSpeed"
      />
    </label>
    <div class="readout">
      <span>{{ pointer.hover || '澄源工业厂区' }}</span>
      <span v-if="pointer.lng != null && pointer.lat != null">{{ pointer.lng.toFixed(5) }}, {{ pointer.lat.toFixed(5) }}</span>
      <span>缩放 <b>{{ view.zoom.toFixed(1) }}</b></span>
      <span>{{ view.lod }}</span>
      <b>{{ clock }}</b>
    </div>
  </footer>
</template>
