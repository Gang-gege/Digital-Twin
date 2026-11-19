import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 端口避开常见的 5173，方便和旁边其它前端项目同时开着。
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5180,
  },
});
