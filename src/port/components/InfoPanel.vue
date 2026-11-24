<script setup lang="ts">
import { BOX_STATUS } from '../mock/portData';
import type { SelectionPayload } from '../types/port';

defineProps<{ payload: SelectionPayload | null }>();
defineEmits<{ close: []; focus: [id: string] }>();
</script>

<template>
  <aside v-if="payload" class="info-card">
    <header>
      <div>
        <p>{{ payload.subtitle }}</p>
        <strong>{{ payload.title }}</strong>
      </div>
      <button type="button" @click="$emit('close')">关闭</button>
    </header>
    <b class="badge" :class="payload.level">{{ payload.badge }}</b>
    <dl>
      <template v-for="row in payload.rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
    <ul v-if="payload.items?.length">
      <li v-for="item in payload.items" :key="item.id">
        <button type="button" @click="$emit('focus', item.id)">
          <i :style="{ background: BOX_STATUS[item.status as keyof typeof BOX_STATUS]?.color || '#8aa4b8' }" />
          <span>{{ item.name }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>
