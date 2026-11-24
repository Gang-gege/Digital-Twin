<script setup lang="ts">
import type { MeasureMode, PointerInfo, PresetName, RoamMode, SceneMode, TimeMode, ViewInfo } from '../types/port';

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
  box: [enabled: boolean];
  measure: [mode: MeasureMode];
  clearMeasure: [];
  time: [mode: TimeMode];
  play: [playing: boolean];
  speed: [value: number];
  resetSim: [];
  note: [text: string];
}>();
</script>

<template>
  <footer class="toolbar">
    <div class="tools">
      <button type="button" @click="emit('preset', 'overview')">总览</button>
      <button type="button" @click="emit('preset', 'berth')">泊位</button>
      <button type="button" @click="emit('preset', 'yard')">堆场</button>
      <button type="button" @click="emit('preset', 'gate')">闸口</button>
      <button type="button" @click="emit('reset')">复位</button>
      <button type="button" :class="{ on: mode.roamMode === 'fps' }" @click="emit('roam', mode.roamMode === 'fps' ? 'free' : 'fps')">巡检</button>
      <button type="button" :class="{ on: mode.boxMode }" @click="emit('box', !mode.boxMode)">框选</button>
      <button type="button" :class="{ on: mode.measureMode === 'distance' }" @click="emit('measure', mode.measureMode === 'distance' ? 'none' : 'distance')">测距</button>
      <button type="button" :class="{ on: mode.measureMode === 'area' }" @click="emit('measure', mode.measureMode === 'area' ? 'none' : 'area')">区域</button>
      <button type="button" :class="{ on: mode.measureMode === 'text' }" @click="emit('measure', mode.measureMode === 'text' ? 'none' : 'text')">文字</button>
      <button type="button" @click="emit('clearMeasure')">清除标注</button>
      <button type="button" :class="{ on: mode.timeMode === 'day' }" @click="emit('time', 'day')">白天</button>
      <button type="button" :class="{ on: mode.timeMode === 'night' }" @click="emit('time', 'night')">夜晚</button>
      <button type="button" :class="{ on: mode.playing }" @click="emit('play', true)">播放</button>
      <button type="button" :class="{ on: !mode.playing }" @click="emit('play', false)">暂停</button>
      <button type="button" @click="emit('resetSim')">重置</button>
    </div>
    <label class="speed">
      倍速 {{ mode.speed.toFixed(1) }}x
      <input
        type="range"
        min="0.5"
        max="3"
        step="0.5"
        :value="mode.speed"
        @input="emit('speed', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label class="speed">
      标注
      <input :value="note" type="text" maxlength="16" @input="emit('note', ($event.target as HTMLInputElement).value)" />
    </label>
    <div class="readout">
      <span>{{ clock }}</span>
      <span>缩放 <b>{{ view.zoom.toFixed(2) }}</b></span>
      <span>俯仰 <b>{{ view.pitch.toFixed(0) }}°</b></span>
      <span>{{ view.culled }}</span>
      <span v-if="pointer.hover">{{ pointer.hover }}</span>
    </div>
  </footer>
</template>
