import * as THREE from 'three';
import { load as loadAMap } from '@amap/amap-jsapi-loader';
import { CameraController } from '../../core/CameraController';
import { ModelLoader } from '../../core/ModelLoader';
import type { AMapMap, AMapNamespace, AMapOverlay } from '../../types/amap';
import { CoordTransformer, metersToLngLat, syncMapCamera } from '../../utils/coord';
import {
  PORT_CENTER,
  PORT_NAME,
  blocks,
  blockCenter,
  presetTarget,
} from '../mock/portData';
import type {
  AlarmRecord,
  EntityKind,
  LayerName,
  LngLat,
  MeasureMode,
  PresetName,
  RoamMode,
  SceneHooks,
  SelectionPayload,
  TimeMode,
} from '../types/port';
import { PortWorld } from './createWorld';
import { InteractionController } from './InteractionController';
import { LayerManager } from './LayerManager';
import {
  presentContainer,
  presentCrane,
  presentFacility,
  presentMulti,
  presentTruck,
} from '../utils/present';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);

/**
 * 场景门面：高德 GLCustomLayer 与 Three 共用 WebGL，相机每帧同步。
 * Vue 只调这里的方法。仿真数据都在前端，没有后端。
 */
export class MapScene {
  declare container: HTMLElement;
  declare hooks: SceneHooks;
  declare layers: LayerManager;
  declare modelLoader: ModelLoader;
  declare playing: boolean;
  declare speed: number;
  declare roamMode: RoamMode;
  declare measureMode: MeasureMode;
  declare boxMode: boolean;
  declare timeMode: TimeMode;
  declare selection: SelectionPayload | null;
  declare ready: boolean;
  declare clock: THREE.Clock;
  declare lastFrame: number;
  declare lastView: number;
  declare AMap: AMapNamespace;
  declare map: AMapMap;
  declare world: PortWorld;
  declare camera: THREE.PerspectiveCamera;
  declare renderer: THREE.WebGLRenderer;
  declare cameraCtrl: CameraController;
  declare interaction: InteractionController;
  declare markerById: Map<string, AMapOverlay>;
  declare replacedCrane: string | null;
  declare renderFailed: boolean;
  declare raf: number;
  declare observer?: ResizeObserver;
  declare onKeyDown: (event: KeyboardEvent) => void;
  declare onDragOver: (event: DragEvent) => void;
  declare onDrop: (event: DragEvent) => void;

  constructor(container: HTMLElement, hooks: SceneHooks) {
    this.container = container;
    this.hooks = hooks;
    this.layers = new LayerManager();
    this.modelLoader = new ModelLoader();
    this.playing = true;
    this.speed = 1;
    this.roamMode = 'free';
    this.measureMode = 'none';
    this.boxMode = false;
    this.timeMode = 'day';
    this.selection = null;
    this.ready = false;
    this.clock = new THREE.Clock();
    this.lastFrame = 0;
    this.lastView = 0;
    this.markerById = new Map();
    this.replacedCrane = null;
    this.renderFailed = false;
    this.raf = 0;
  }

  async init() {
    try {
      const { key, securityJsCode, missing } = amapConfig();
      this.hooks.onLoading?.({ step: 0, text: '正在校验地图配置' });
      if (missing) {
        throw new Error('缺少高德 Key。请把 .env.example 复制为 .env，填入 VITE_AMAP_KEY 与安全密钥后重新启动。');
      }
      this.hooks.onLoading?.({ step: 1, text: '正在加载高德 JS API' });
      const AMap = await loadAMap({
        key,
        version: '2.0',
        plugins: ['AMap.Scale', 'AMap.ControlBar'],
      }) as AMapNamespace;
      this.AMap = AMap;
      this.hooks.onLoading?.({ step: 2, text: '正在创建三维地图并生成码头' });
      this.map = new AMap.Map(this.container, {
        viewMode: '3D',
        center: PORT_CENTER,
        zoom: 16.22,
        pitch: 55,
        rotation: -16,
        zooms: [15, 20],
        mapStyle: 'amap://styles/whitesmoke',
        showBuildingBlock: false,
        skyColor: '#9eb4c8',
        features: ['bg', 'road', 'point'],
      });
      try {
        this.map.addControl(new AMap.Scale({ position: 'LB' }));
        this.map.addControl(new AMap.ControlBar({ position: { right: '12px', bottom: '16px' } }));
      } catch (error) {
        console.warn('地图控件初始化失败', error);
      }
      await waitMap(this.map);
      const glReady = new Promise<void>((resolve, reject) => {
        const layer = new AMap.GLCustomLayer({
          zIndex: 120,
          init: (gl) => {
            try {
              this.setupGL(gl);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          render: () => this.renderGL(),
        });
        this.map.add(layer);
      });
      if (typeof this.map.render === 'function') this.map.render();
      await Promise.race([
        glReady,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('高德没有交出 WebGL 上下文。请用 Chrome 或 Edge 打开，并确认已开启硬件加速')), 8000);
        }),
      ]);
      this.cameraCtrl = new CameraController(this.map, this.container);
      this.cameraCtrl.onModeExit = () => {
        if (this.roamMode === 'fps') this.setRoamMode('free');
      };
      this.interaction = new InteractionController({
        AMap,
        map: this.map,
        camera: this.camera,
        dom: this.container,
        world: this.world,
        containerVisible: () => this.layers.isVisible('container'),
        onSelect: (hit) => {
          if (!hit) this.clearSelection();
          else this.select(hit.kind, hit.id);
        },
        onBox: (list) => {
          if (!list.length) {
            this.hooks.onToast?.('框选范围内没有集装箱');
            return;
          }
          this.applySelection(presentMulti(list));
        },
        onPointer: (info) => this.hooks.onPointer?.(info),
      });
      this.bindOverlays();
      this.bindLayers();
      this.map.on('mousedown', () => {
        this.cameraCtrl.hold(true);
        if (this.roamMode === 'free') this.cameraCtrl.cancelFly();
      });
      this.map.on('mouseup', () => this.cameraCtrl.hold(false));
      this.onKeyDown = (event) => this.handleKey(event);
      this.onDragOver = (event) => event.preventDefault();
      this.onDrop = (event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (file) void this.loadModelFile(file);
      };
      window.addEventListener('keydown', this.onKeyDown);
      this.container.addEventListener('dragover', this.onDragOver);
      this.container.addEventListener('drop', this.onDrop);
      this.observer = new ResizeObserver(() => this.map.resize());
      this.observer.observe(this.container);
      this.applyMapStatus();
      this.startLoop();
      this.ready = true;
      this.hooks.onLoading?.({ step: 3, text: '码头仿真已启动' });
      this.hooks.onReady?.();
      this.hooks.onToast?.(`${PORT_NAME}已启动`);
      if (!securityJsCode) this.hooks.onToast?.('未配置安全密钥。若底图空白，请补上 VITE_AMAP_SECURITY_JS_CODE');
      this.emitMode();
      this.emitLists();
      window.__port = this;
    } catch (error) {
      console.error(error);
      this.hooks.onError?.(error instanceof Error ? error.message : '场景初始化失败');
    }
  }

  /**
   * 高德把 WebGL1 上下文交进来。Three 从 r163 起不再接受 WebGL1，所以工程锁定 0.162。
   * autoClear 必须关掉，否则会把底图清掉。
   */
  setupGL(gl: WebGLRenderingContext) {
    this.renderer = new THREE.WebGLRenderer({ context: gl });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 1 << 30);
    this.world = new PortWorld(scene, new CoordTransformer(this.map, PORT_CENTER));
  }

  renderGL() {
    if (!this.renderer || !this.world || !this.camera) return;
    try {
      const size = this.map.getSize();
      this.renderer.resetState();
      syncMapCamera(this.world.coord.customCoords, this.camera, this.world.coord.center, size.width / Math.max(1, size.height));
      const gl = this.renderer.getContext();
      this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      this.renderer.clearDepth();
      this.renderer.render(this.world.scene, this.camera);
      this.renderer.resetState();
    } catch (error) {
      if (this.renderFailed) return;
      this.renderFailed = true;
      console.error(error);
      this.hooks.onToast?.(`三维渲染异常：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  startLoop() {
    const step = (now: number) => {
      this.raf = requestAnimationFrame(step);
      if (!this.map || document.hidden) return;
      const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      const simDt = this.playing ? dt * this.speed : 0;
      this.world.update(simDt, this.clock.getElapsedTime(), this.camera);
      this.cameraCtrl.update(dt, false);
      this.map.render();
      if (now - this.lastView > 400) {
        this.lastView = now;
        this.emitView();
        this.emitLists();
        this.refreshMovingMarkers();
        this.refreshLiveSelection();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  bindOverlays() {
    const markers: AMapOverlay[] = [];
    this.world.craneUnits.forEach((crane) => markers.push(this.marker(crane.id, crane.lng, crane.lat, '#f0b429', () => this.select('crane', crane.id))));
    this.world.truckUnits.forEach((truck) => markers.push(this.marker(truck.id, truck.lng, truck.lat, '#38bdf8', () => this.select('truck', truck.id), [17, 20])));
    this.world.facilityUnits.filter((item) => item.kind === 'weigh' || item.kind === 'gate').forEach((item) => {
      markers.push(this.marker(item.id, item.lng, item.lat, '#e2e8f0', () => this.select(item.kind === 'gate' ? 'gate' : 'weigh', item.id)));
    });
    blocks.forEach((block) => {
      const center = blockCenter(block);
      const [lng, lat] = metersToLngLat(PORT_CENTER, center.east, center.north);
      const text = new this.AMap.Text({
        text: block.name,
        position: [lng, lat],
        offset: new this.AMap.Pixel(0, -8),
        zooms: [15.6, 20],
        zIndex: 140,
        style: labelStyle(false),
      });
      text.on?.('click', () => {
        const box = this.world.containers.find((item) => item.blockId === block.id && !item.hidden);
        if (box) this.select('container', box.id);
        else this.flyTo(lng, lat, true);
      });
      markers.push(text);
    });
    this.map.add(new this.AMap.OverlayGroup(markers));
  }

  marker(id: string, lng: number, lat: number, color: string, onClick: () => void, zooms: [number, number] = [15.2, 20]) {
    const marker = new this.AMap.CircleMarker({
      center: [lng, lat],
      radius: 5,
      strokeColor: '#081018',
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: 0.95,
      zIndex: 160,
      bubble: false,
      cursor: 'pointer',
      zooms,
    });
    marker.on?.('click', onClick);
    this.markerById.set(id, marker);
    return marker;
  }

  bindLayers() {
    this.layers.register('crane', this.world.craneGroup);
    this.layers.register('container', this.world.containerGroup);
    this.layers.register('truck', this.world.truckGroup);
    this.layers.register('road', this.world.roadGroup);
    this.layers.register('alarm', this.world.alarmGroup);
    this.layers.register('flow', this.world.flowGroup);
    this.layers.register('trail', this.world.trailGroup);
    this.layers.register('water', this.world.waterGroup);
    this.layers.register('facility', this.world.facilityGroup);
    this.layers.register('measure', {
      show: () => this.interaction.setMeasureVisible(true),
      hide: () => this.interaction.setMeasureVisible(false),
    });
    this.hooks.onLayers?.({ ...this.layers.state });
  }

  emitLists() {
    this.hooks.onStats?.(this.world.stats());
    this.hooks.onAlarms?.(this.world.alarmList());
    this.hooks.onLogs?.(this.world.dispatch.logs);
    this.hooks.onTasks?.(this.world.dispatch.tasks());
  }

  emitView() {
    this.hooks.onView?.({
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      rotation: this.map.getRotation(),
      culled: this.world.culledText,
    });
  }

  emitMode() {
    this.hooks.onMode?.({
      roamMode: this.roamMode,
      measureMode: this.measureMode,
      boxMode: this.boxMode,
      timeMode: this.timeMode,
      playing: this.playing,
      speed: this.speed,
      measureHint: this.interaction?.measure.hint || '',
    });
  }

  setLayer(name: LayerName, visible: boolean) {
    this.layers.setVisible(name, visible);
    this.hooks.onLayers?.({ ...this.layers.state });
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.emitMode();
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.5, Math.min(3, speed));
    this.emitMode();
  }

  resetSim() {
    this.world.reset();
    this.playing = true;
    this.emitLists();
    this.emitMode();
    this.hooks.onToast?.('码头仿真已重置');
    if (this.selection?.id) this.select(this.selection.kind as EntityKind, this.selection.id, false);
  }

  setRoamMode(mode: RoamMode) {
    if (this.roamMode === mode) return;
    if (mode === 'fps') {
      this.boxMode = false;
      this.interaction.setBoxMode(false);
    }
    this.roamMode = mode;
    this.cameraCtrl.setMode(mode);
    this.applyMapStatus();
    this.emitMode();
    if (mode === 'fps') this.hooks.onToast?.('第一人称：WASD 移动，鼠标转向，Shift 加速，滚轮缩放，Esc 退出');
  }

  setBoxMode(enabled: boolean) {
    if (enabled && this.roamMode === 'fps') this.setRoamMode('free');
    if (enabled && this.measureMode !== 'none') this.setMeasureMode('none');
    this.boxMode = enabled;
    this.interaction.setBoxMode(enabled);
    this.applyMapStatus();
    this.emitMode();
  }

  setMeasureMode(mode: MeasureMode) {
    if (mode !== 'none' && this.roamMode === 'fps') this.setRoamMode('free');
    if (mode !== 'none') {
      this.boxMode = false;
      this.interaction.setBoxMode(false);
    }
    this.measureMode = mode;
    this.interaction.setMeasureMode(mode);
    this.applyMapStatus();
    this.emitMode();
  }

  clearMeasure() {
    this.interaction.clearMeasure();
    this.hooks.onToast?.('已清除测量标注');
  }

  setAnnotation(text: string) {
    this.interaction.setAnnotation(text);
  }

  setTimeOfDay(mode: TimeMode) {
    this.timeMode = mode;
    this.world.setTimeOfDay(mode);
    this.map.setMapStyle(mode === 'night' ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke');
    this.emitMode();
  }

  flyPreset(name: PresetName) {
    const preset = presetTarget(name);
    if (this.roamMode === 'fps') this.setRoamMode('free');
    this.cameraCtrl.flyTo(preset);
  }

  resetView() {
    this.flyPreset('overview');
  }

  captureView() {
    return this.cameraCtrl.snapshot();
  }

  flyBookmark(view: { center: LngLat; zoom: number; pitch: number; rotation: number }) {
    if (this.roamMode === 'fps') this.setRoamMode('free');
    this.cameraCtrl.flyTo(view);
  }

  focusAlarm(record: AlarmRecord) {
    if (record.kind === 'crane') this.select('crane', record.targetId, true);
    else if (record.kind === 'yard') {
      const box = this.world.containers.find((item) => item.blockId === record.targetId && !item.hidden);
      if (box) this.select('container', box.id, true);
      else this.flyEast(record.east, record.north, true);
    } else if (record.kind === 'gate') this.select('gate', record.targetId, true);
    else {
      const truck = this.world.truckUnits.find((item) => Math.hypot(item.east - record.east, item.north - record.north) < 30);
      if (truck) this.select('truck', truck.id, true);
      else this.flyEast(record.east, record.north, true);
    }
  }

  select(kind: EntityKind | 'multi', id: string, fly = true) {
    if (kind === 'multi') return;
    const payload = this.present(kind, id);
    if (!payload) return;
    this.applySelection(payload);
    if (fly && payload.lng != null && payload.lat != null) this.flyTo(payload.lng, payload.lat, kind === 'container');
  }

  present(kind: EntityKind, id: string): SelectionPayload | null {
    if (kind === 'crane') {
      const crane = this.world.craneUnits.find((item) => item.id === id);
      return crane ? presentCrane(crane) : null;
    }
    if (kind === 'truck') {
      const truck = this.world.truckUnits.find((item) => item.id === id);
      return truck ? presentTruck(truck) : null;
    }
    if (kind === 'container') {
      const box = this.world.containerById(id);
      return box ? presentContainer(box) : null;
    }
    const facility = this.world.facilityUnits.find((item) => item.id === id);
    return facility ? presentFacility(facility) : null;
  }

  applySelection(payload: SelectionPayload) {
    this.selection = payload;
    const ids = payload.kind === 'multi' ? (payload.items || []).map((item) => item.id) : payload.id ? [payload.id] : [];
    this.world.highlight(ids);
    this.refreshMarkerStyles();
    this.hooks.onSelect?.(payload);
  }

  clearSelection() {
    this.selection = null;
    this.world.highlight([]);
    this.refreshMarkerStyles();
    this.hooks.onSelect?.(null);
  }

  flyTo(lng: number, lat: number, strong = false) {
    const view = this.cameraCtrl.snapshot();
    this.cameraCtrl.flyTo({
      center: [lng, lat],
      zoom: strong ? 18.15 : Math.max(view.zoom, 17.4),
      pitch: Math.max(view.pitch, 52),
      rotation: view.rotation,
    });
  }

  flyEast(east: number, north: number, strong = false) {
    const [lng, lat] = metersToLngLat(PORT_CENTER, east, north);
    this.flyTo(lng, lat, strong);
  }

  refreshLiveSelection() {
    if (!this.selection?.id || this.selection.kind === 'multi') return;
    if (this.selection.kind !== 'truck' && this.selection.kind !== 'crane' && this.selection.kind !== 'weigh' && this.selection.kind !== 'gate') return;
    const payload = this.present(this.selection.kind, this.selection.id);
    if (!payload) return;
    this.selection = payload;
    this.hooks.onSelect?.(payload);
  }

  refreshMovingMarkers() {
    const move = (id: string, lng: number, lat: number) => {
      const marker = this.markerById.get(id) as (AMapOverlay & { setCenter?: (center: LngLat) => void }) | undefined;
      marker?.setCenter?.([lng, lat]);
    };
    this.world.craneUnits.forEach((crane) => move(crane.id, crane.lng, crane.lat));
    this.world.truckUnits.forEach((truck) => move(truck.id, truck.lng, truck.lat));
  }

  refreshMarkerStyles() {
    const selected = this.selection?.id;
    this.markerById.forEach((marker, id) => {
      marker.setOptions?.({
        radius: id === selected ? 8 : 5,
        strokeColor: id === selected ? '#fde68a' : '#081018',
        strokeWeight: id === selected ? 2 : 1,
      });
    });
  }

  /** 预留真实岸桥模型。默认仍是几何白模，选中岸桥后可换成 glb / gltf。 */
  async loadModelFile(file: File) {
    const craneId = this.selection?.kind === 'crane' ? this.selection.id : null;
    if (!craneId) {
      this.hooks.onToast?.('请先点选一台岸桥，再加载 GLB / GLTF');
      return;
    }
    if (!/\.glb$|\.gltf$/i.test(file.name)) {
      this.hooks.onToast?.('请选择 .glb 或 .gltf 文件');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      this.hooks.onToast?.('正在解析模型…');
      const holder = await this.modelLoader.loadFitted(url, { w: 16, d: 54, h: 38 });
      const rig = this.world.animator.rigs.find((item) => item.id === craneId);
      if (!rig) return;
      rig.body.forEach((mesh) => {
        mesh.visible = false;
      });
      holder.name = 'gltf-crane';
      rig.group.add(holder);
      this.replacedCrane = craneId;
      this.hooks.onToast?.('已替换岸桥白模。吊具动画仍走原来的节点');
    } catch (error) {
      console.error(error);
      this.hooks.onToast?.(`模型加载失败：${error instanceof Error ? error.message : '文件无法解析'}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  applyMapStatus() {
    const locked = this.roamMode === 'fps' || this.boxMode;
    const measuring = this.measureMode !== 'none';
    this.map.setStatus({
      dragEnable: !locked,
      rotateEnable: !locked && !measuring,
      pitchEnable: !locked && !measuring,
      keyboardEnable: false,
      doubleClickZoom: this.measureMode === 'none' && this.roamMode !== 'fps',
    });
    if (this.roamMode === 'fps') this.container.style.cursor = 'none';
    else if (this.boxMode || measuring) this.container.style.cursor = 'crosshair';
    else this.container.style.cursor = '';
  }

  handleKey(event: KeyboardEvent) {
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (this.roamMode === 'fps' && MOVE_KEYS.has(event.code)) event.preventDefault();
    if (event.code === 'Digit1') this.flyPreset('overview');
    if (event.code === 'Digit2') this.flyPreset('berth');
    if (event.code === 'Digit3') this.flyPreset('yard');
    if (event.code === 'Digit4') this.flyPreset('gate');
    if (event.code === 'Digit0' || (event.code === 'KeyR' && this.roamMode !== 'fps')) this.resetView();
    if (event.code === 'KeyN') this.setTimeOfDay(this.timeMode === 'night' ? 'day' : 'night');
    if (event.code === 'KeyB') this.setBoxMode(!this.boxMode);
    if (event.code === 'Space') {
      event.preventDefault();
      this.setPlaying(!this.playing);
    }
    if (event.code === 'Escape') {
      if (this.roamMode === 'fps') this.setRoamMode('free');
      else if (this.boxMode) this.setBoxMode(false);
      else if (this.measureMode !== 'none') this.setMeasureMode('none');
      else this.clearSelection();
    }
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    this.container.removeEventListener('dragover', this.onDragOver);
    this.container.removeEventListener('drop', this.onDrop);
    this.interaction?.dispose();
    this.cameraCtrl?.dispose();
    this.world?.dispose();
    this.map?.destroy();
    if (window.__port === this) delete window.__port;
  }
}

function amapConfig() {
  const key = String(import.meta.env.VITE_AMAP_KEY || '').trim();
  const securityJsCode = String(import.meta.env.VITE_AMAP_SECURITY_JS_CODE || '').trim();
  return { key, securityJsCode, missing: !key };
}

function waitMap(map: AMapMap) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('地图加载超时。请检查 Key、安全密钥，以及 localhost 是否已加入域名白名单'));
    }, 15000);
    map.on('complete', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function labelStyle(active: boolean): Record<string, string> {
  return {
    'background-color': active ? 'rgba(3, 105, 161, 0.92)' : 'rgba(8, 16, 32, 0.78)',
    border: active ? '1px solid #7dd3fc' : '1px solid rgba(148, 196, 214, 0.45)',
    color: '#e8f6ff',
    'font-size': '12px',
    padding: '2px 6px',
    'border-radius': '2px',
    'white-space': 'nowrap',
  };
}
