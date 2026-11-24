/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_KEY: string;
  readonly VITE_AMAP_SECURITY_JS_CODE: string;
}

interface Window {
  _AMapSecurityConfig?: { securityJsCode: string };
  __park?: object;
  __port?: import('./port/core/MapScene').MapScene;
}
