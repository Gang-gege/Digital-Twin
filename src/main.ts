import { createApp } from 'vue';
import App from './App.vue';
import './styles/global.css';

// 安全密钥必须在高德脚本加载之前挂到 window 上，Loader 会读取它。
// Key 本身交给 AMapLoader.load({ key })，两处都只读环境变量，不写死在代码里。
window._AMapSecurityConfig = {
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_JS_CODE || '',
};

const app = createApp(App);
app.config.errorHandler = (err, _instance, info) => {
  console.error('[星澜园区]', info, err);
  const message = err instanceof Error ? err.message : String(err);
  window.dispatchEvent(new CustomEvent('park-error', { detail: message }));
};
app.mount('#app');
