<script setup lang="ts">
import { ref } from 'vue';
import HomeGate from './home/HomeGate.vue';
import ParkView from './park/ParkView.vue';
import PlantView from './plant/PlantView.vue';
import PortView from './port/PortView.vue';
import './styles/home.scss';

const scene = ref<'home' | 'park' | 'plant' | 'port'>('home');
</script>

<template>
  <HomeGate v-if="scene === 'home'" @enter="scene = $event" />
  <ParkView v-else-if="scene === 'park'" @leave="scene = 'home'" />
  <PlantView v-else-if="scene === 'plant'" @leave="scene = 'home'" />
  <PortView v-else @leave="scene = 'home'" />
</template>
