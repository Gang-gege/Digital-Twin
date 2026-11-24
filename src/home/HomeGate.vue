<script setup lang="ts">
defineEmits<{
  enter: [scene: 'park' | 'plant' | 'port'];
}>();
</script>

<template>
  <main class="home">
    <header class="home-head">
      <p>DIGITAL TWIN</p>
      <h1>选择一个场景</h1>
    </header>
    <div class="cards">
      <button class="card park" type="button" @click="$emit('enter', 'park')">
        <em>SMART PARK</em>
        <strong>星澜智慧园区</strong>
        <span>楼宇、充电、门禁和人流热力。适合看园区运营和二维三维联动。</span>
        <b>进入园区</b>
      </button>
      <button class="card plant" type="button" @click="$emit('enter', 'plant')">
        <em>POWER / WATER</em>
        <strong>澄源工业厂区</strong>
        <span>厂房、地下管网、叉车巡线和三级告警。适合看电力水务厂区。</span>
        <b>进入厂区</b>
      </button>
      <button class="card port" type="button" @click="$emit('enter', 'port')">
        <em>CONTAINER TERMINAL</em>
        <strong>澜港集装箱码头</strong>
        <span>岸桥吊装、集卡路网、箱区调度和作业飞线。适合看码头仿真和实例化渲染。</span>
        <b>进入码头</b>
      </button>
    </div>
  </main>
</template>
