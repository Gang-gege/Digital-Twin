<script setup lang="ts">
import { ALARM_COLOR, BOX_STATUS, HEAT_COLOR } from '../mock/portData';
import type {
  AlarmRecord,
  JobLog,
  LayerName,
  LayerState,
  PanelTab,
  PortStats,
  Viewpoint,
  WorkTask,
} from '../types/port';

defineProps<{
  tab: PanelTab;
  stats: PortStats;
  alarms: AlarmRecord[];
  logs: JobLog[];
  tasks: WorkTask[];
  layers: LayerState;
  bookmarks: Viewpoint[];
}>();

const emit = defineEmits<{
  layer: [payload: { name: LayerName; visible: boolean }];
  focus: [alarm: AlarmRecord];
  saveMark: [name: string];
  flyMark: [view: Viewpoint];
  dropMark: [id: string];
  loadModel: [file: File];
}>();

const layerItems: Array<{ name: LayerName; label: string }> = [
  { name: 'crane', label: '岸桥' },
  { name: 'container', label: '集装箱' },
  { name: 'truck', label: '集卡' },
  { name: 'road', label: '道路标线' },
  { name: 'alarm', label: '告警' },
  { name: 'flow', label: '流向飞线' },
  { name: 'trail', label: '行驶轨迹' },
  { name: 'water', label: '水面' },
  { name: 'facility', label: '设施' },
  { name: 'measure', label: '测量标注' },
];

const boxLegend = Object.values(BOX_STATUS);
const alarmLegend = [
  { name: '提示', color: ALARM_COLOR.info },
  { name: '预警', color: ALARM_COLOR.warning },
  { name: '紧急', color: ALARM_COLOR.urgent },
];
const heatLegend = [
  { name: '畅通', color: HEAT_COLOR[0] },
  { name: '缓行', color: HEAT_COLOR[1] },
  { name: '拥堵', color: HEAT_COLOR[2] },
];

function onMark(event: Event) {
  const form = event.target as HTMLFormElement;
  const input = form.elements.namedItem('mark') as HTMLInputElement | null;
  const name = input?.value.trim();
  if (!name) return;
  emit('saveMark', name);
  if (input) input.value = '';
}

function onModel(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) emit('loadModel', file);
}
</script>

<template>
  <aside class="side">
    <section v-if="tab === 'board'" class="pad">
      <h2>运行看板</h2>
      <div class="stats">
        <div>
          <b>{{ Math.round(stats.berthRate * 100) }}%</b>
          <span>泊位利用率</span>
        </div>
        <div>
          <b>{{ stats.yardBoxes }}</b>
          <span>在场箱量</span>
        </div>
        <div>
          <b>{{ stats.trucksInPort }}</b>
          <span>在港集卡</span>
        </div>
        <div>
          <b class="ok">{{ stats.trucksMoving }}</b>
          <span>在途集卡</span>
        </div>
        <div>
          <b class="warn">{{ stats.pendingJobs }}</b>
          <span>待作业</span>
        </div>
        <div>
          <b class="urgent">{{ stats.urgent }}</b>
          <span>紧急告警</span>
        </div>
      </div>
      <p class="note">{{ stats.berthText }} · 堆场 {{ stats.yardBoxes }}/{{ stats.yardCapacity }}</p>
      <div v-for="block in stats.blocks" :key="block.id" class="meter">
        <span>{{ block.name }}</span>
        <i><b :style="{ width: `${Math.min(100, block.rate * 100)}%` }" :class="{ hot: block.rate >= 0.9 }" /></i>
        <em>{{ block.count }}/{{ block.capacity }}</em>
      </div>
    </section>

    <section v-if="tab === 'board'" class="pad">
      <h2>待作业任务</h2>
      <div class="alarm-list">
        <p v-if="!tasks.length" class="empty">当前没有排队任务</p>
        <article v-for="task in tasks" :key="task.id" class="alarm-item">
          <i :class="task.state === '进行中' ? 'warning' : 'info'" />
          <span>
            <b>{{ task.title }}</b>
            <em>{{ task.state }} · {{ task.detail }}</em>
          </span>
        </article>
      </div>
    </section>

    <section v-if="tab === 'board'" class="pad">
      <h2>最新告警</h2>
      <div class="alarm-list">
        <p v-if="!alarms.length" class="empty">没有告警</p>
        <button v-for="alarm in alarms" :key="alarm.id" type="button" class="alarm-item" :class="alarm.level" @click="emit('focus', alarm)">
          <i />
          <span>
            <b>{{ alarm.title }}</b>
            <em>{{ alarm.timeText }} · {{ alarm.message }}</em>
          </span>
        </button>
      </div>
    </section>

    <section v-if="tab === 'board'" class="pad">
      <h2>作业日志</h2>
      <div class="alarm-list">
        <p v-if="!logs.length" class="empty">岸桥还没有完成吊装</p>
        <article v-for="log in logs" :key="log.id" class="alarm-item">
          <i class="info" />
          <span>
            <b>{{ log.text }}</b>
            <em>{{ log.timeText }}</em>
          </span>
        </article>
      </div>
    </section>

    <section v-if="tab === 'layers'" class="pad">
      <h2>图层</h2>
      <div class="switches">
        <button
          v-for="item in layerItems"
          :key="item.name"
          type="button"
          class="switch"
          :class="{ on: layers[item.name] }"
          @click="emit('layer', { name: item.name, visible: !layers[item.name] })"
        >
          {{ item.label }}
          <i />
        </button>
      </div>
      <p class="note">点选岸桥后，可以把几何白模换成 .glb / .gltf。吊具动画仍绑定在原节点上。</p>
      <label class="file-btn">
        替换岸桥模型
        <input type="file" accept=".glb,.gltf" hidden @change="onModel" />
      </label>
    </section>

    <section v-if="tab === 'alarms'" class="pad">
      <h2>告警列表</h2>
      <div class="alarm-list">
        <p v-if="!alarms.length" class="empty">没有告警。故障、拥堵、超限和排队会显示在这里。</p>
        <button v-for="alarm in alarms" :key="alarm.id" type="button" class="alarm-item" :class="alarm.level" @click="emit('focus', alarm)">
          <i />
          <span>
            <b>{{ alarm.title }}</b>
            <em>{{ alarm.timeText }} · {{ alarm.message }}</em>
          </span>
        </button>
      </div>
    </section>

    <section v-if="tab === 'legend'" class="pad">
      <h2>集装箱</h2>
      <p v-for="item in boxLegend" :key="item.label" class="legend-row"><i :style="{ background: item.color }" />{{ item.label }}</p>
      <h2>告警</h2>
      <p v-for="item in alarmLegend" :key="item.name" class="legend-row"><i :style="{ background: item.color }" />{{ item.name }}</p>
      <h2>车道</h2>
      <p v-for="item in heatLegend" :key="item.name" class="legend-row"><i :style="{ background: item.color }" />{{ item.name }}</p>
      <h2>设备</h2>
      <p class="legend-row"><i style="background:#f4b942" />岸桥</p>
      <p class="legend-row"><i style="background:#f4c430" />集卡</p>
      <p class="legend-row"><i style="background:#d6dee8" />地磅 / 闸口</p>
    </section>

    <section v-if="tab === 'bookmarks'" class="pad">
      <h2>视角快照</h2>
      <form class="bookmark-form" @submit.prevent="onMark">
        <input name="mark" type="text" maxlength="16" placeholder="快照名称" />
        <button type="submit">保存</button>
      </form>
      <div class="mark-list">
        <p v-if="!bookmarks.length" class="empty">还没有快照。当前镜头会记在这台浏览器里。</p>
        <button v-for="mark in bookmarks" :key="mark.id" type="button" @click="emit('flyMark', mark)">
          <span>
            <b>{{ mark.name }}</b>
            <em>缩放 {{ mark.zoom.toFixed(1) }}</em>
          </span>
          <em class="drop" @click.stop="emit('dropMark', mark.id)">删除</em>
        </button>
      </div>
    </section>
  </aside>
</template>
