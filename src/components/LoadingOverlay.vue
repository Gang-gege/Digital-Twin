<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  step?: number;
  text?: string;
  error?: string;
  scene?: string;
}>(), {
  step: 0,
  text: '',
  error: '',
  scene: '场景',
});

const isKeyError = computed(() => /Key|密钥|\.env|白名单/.test(props.error));

const steps = computed(() => ['校验配置', '加载地图', `生成${props.scene}`, '启动模拟']);
const progress = computed(() => Math.min(100, (props.step + 1) * 25));
</script>

<template>
  <div v-if="visible" class="loading-mask">
    <section v-if="!error" class="loading-card">
      <div class="spinner" />
      <h2>正在构建{{ scene }}数字孪生</h2>
      <p>{{ text }}</p>
      <div class="bar"><i :style="{ width: `${progress}%` }" /></div>
      <ol>
        <li v-for="(label, index) in steps" :key="label" :class="{ done: index < step, current: index === step }">
          {{ label }}
        </li>
      </ol>
    </section>
    <section v-else class="loading-card is-error">
      <h2>场景没有启动</h2>
      <p>{{ error }}</p>
      <ol v-if="isKeyError">
        <li>打开高德控制台，创建 Web 端（JS API）Key</li>
        <li>把 <code>.env.example</code> 复制为 <code>.env</code></li>
        <li>填入 <code>VITE_AMAP_KEY</code> 和 <code>VITE_AMAP_SECURITY_JS_CODE</code></li>
        <li>域名白名单可以留空；要填就只写 <code>localhost</code></li>
        <li>重新执行 <code>npm run dev</code></li>
      </ol>
    </section>
  </div>
</template>
