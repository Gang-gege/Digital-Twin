<script setup>
defineProps({
  payload: { type: Object, default: null },
});
defineEmits(['close', 'focus']);
</script>

<template>
  <aside v-if="payload" class="info-card">
    <header>
      <div>
        <em :class="payload.level">{{ payload.badge }}</em>
        <h3>{{ payload.title }}</h3>
        <p>{{ payload.subtitle }}</p>
      </div>
      <button title="关闭" @click="$emit('close')">×</button>
    </header>
    <dl>
      <div v-for="row in payload.rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <ul v-if="payload.items?.length">
      <li v-for="item in payload.items" :key="item.id">
        <button @click="$emit('focus', item.id)">
          <i :class="item.level" />
          <span>{{ item.name }}</span>
          <em>{{ item.status }}</em>
        </button>
      </li>
    </ul>
  </aside>
</template>
