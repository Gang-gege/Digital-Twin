import * as THREE from 'three';
import { load as loadAMap } from '@amap/amap-jsapi-loader';
import {
  buildings,
  devices,
  gates,
  heatPoints,
  PARK_CENTER,
  PARK_NAME,
  pipes,
  presetTarget,
} from '../mock/parkData';
import type { AMapMap, AMapNamespace, AMapOverlay, HeatMapLayer } from '../../types/amap';
import type {
  Building,
  Device,
  EntityKind,
  Gate,
  LayerName,
  MeasureMode,
  ParkEntity,
  Pipe,
  PresetName,
  ResolvedHit,
  RoamMode,
  SceneHooks,
  SelectionPayload,
  TimeMode,
} from '../types/park';
import { CoordTransformer, syncMapCamera } from '../../utils/coord';
import {
  presentBuilding,
  presentDevice,
  presentGate,
  presentMulti,
  presentPipe,
  STATUS_HEX,
  statusKey,
} from '../utils/present';
import { AlarmManager } from './AlarmManager';
import { CameraController } from '../../core/CameraController';
import { InteractionController } from './InteractionController';
import { LayerManager } from './LayerManager';
import { ModelLoader } from '../../core/ModelLoader';
import { ParkWorld } from './createWorld';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);

interface NamedPlace {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

/**
 * 场景门面。
 * 负责加载高德、创建共享 WebGL 上下文、把相机同步交给渲染回调，
 * 并把图层、告警、交互、漫游这些类串起来。Vue 只通过这里的方法驱动场景。
 */
export class MapScene {
  declare container: HTMLElement;
  declare hooks: SceneHooks;
  declare layers: LayerManager;
  declare modelLoader: ModelLoader;
  declare lookup: {
    buildings: Map<string, Building>;
    devices: Map<string, Device>;
    pipes: Map<string, Pipe>;
    gates: Map<string, Gate>;
  };
  declare roamMode: RoamMode;
  declare measureMode: MeasureMode;
  declare boxMode: boolean;
  declare autoRotate: boolean;
  declare timeMode: TimeMode;
  declare heatVisible: boolean;
  declare selection: SelectionPayload | null;
  declare ready: boolean;
  declare clock: THREE.Clock;
  declare lastFrame: number;
  declare lastView: number;
  declare lastHeat: number;
  declare markerById: Map<string, AMapOverlay>;
  declare labelById: Map<string, AMapOverlay>;
  declare AMap: AMapNamespace;
  declare map: AMapMap;
  declare coord: CoordTransformer;
  declare layer: unknown;
  declare renderer: THREE.WebGLRenderer;
  declare scene: THREE.Scene;
  declare camera: THREE.PerspectiveCamera;
  declare world: ParkWorld;
  declare cameraCtrl: CameraController;
  declare interaction: InteractionController;
  declare alarms: AlarmManager;
  declare renderFailed: boolean;
  declare raf: number;
  declare observer?: ResizeObserver;
  declare deviceOverlay: AMapOverlay;
  declare buildingOverlay: AMapOverlay;
  declare heatmap: HeatMapLayer;
  declare onKeyDown: (event: KeyboardEvent) => void;
  declare onDragOver: (event: DragEvent) => void;
  declare onDrop: (event: DragEvent) => void;

  constructor(container: HTMLElement, hooks: SceneHooks) {
    this.container = container;
    this.hooks = hooks;
    this.layers = new LayerManager();
    this.modelLoader = new ModelLoader();
    this.lookup = {
      buildings: new Map(buildings.map((item) => [item.id, item])),
      devices: new Map(devices.map((item) => [item.id, item])),
      pipes: new Map(pipes.map((item) => [item.id, item])),
      gates: new Map(gates.map((item) => [item.id, item])),
    };
    this.roamMode = 'free';
    this.measureMode = 'none';
    this.boxMode = false;
    this.autoRotate = false;
    this.timeMode = 'day';
    this.heatVisible = false;
    this.selection = null;
    this.ready = false;
    this.clock = new THREE.Clock();
    this.lastFrame = 0;
    this.lastView = 0;
    this.lastHeat = 0;
    this.markerById = new Map();
    this.labelById = new Map();
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
        plugins: ['AMap.Scale', 'AMap.ControlBar', 'AMap.HeatMap'],
      }) as AMapNamespace;
      this.AMap = AMap;

      this.hooks.onLoading?.({ step: 2, text: '正在创建三维地图并生成园区' });
      this.map = new AMap.Map(this.container, {
        viewMode: '3D',
        center: PARK_CENTER,
        zoom: 16.62,
        pitch: 54,
        rotation: -28,
        zooms: [14, 20],
        mapStyle: 'amap://styles/whitesmoke',
        showBuildingBlock: false,
        skyColor: '#c5d4e8',
        features: ['bg', 'road', 'point'],
      });
      this.addControls(AMap);
      await waitMap(this.map);

      this.coord = new CoordTransformer(this.map, PARK_CENTER);
      // init 往往在 map.add 之后的某一帧才执行，不能立刻检查 camera。
      const glReady = new Promise<void>((resolve, reject) => {
        this.layer = new AMap.GLCustomLayer({
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
      });
      this.map.add(this.layer);
      if (typeof this.map.render === 'function') this.map.render();
      await Promise.race([
        glReady,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('高德没有交出 WebGL 上下文。请用 Chrome 或 Edge 打开，并确认系统开启了硬件加速'));
          }, 8000);
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
        center: PARK_CENTER,
        syncCamera: () => this.syncCamera(),
        getPickables: () => this.world.getPickables(),
        deviceVisible: () => this.layers.isVisible('device'),
        lookup: this.lookup,
        onSelect: (resolved) => this.selectResolved(resolved),
        onBox: (list) => this.selectBox(list),
        onPointer: (info) => this.hooks.onPointer?.(info),
      });
      this.setupOverlays(AMap);
      this.bindMapHold();
      this.alarms = new AlarmManager(devices, () => this.onAlarmChange());
      this.onAlarmChange();
      this.alarms.start();

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
      this.observer = new ResizeObserver(() => this.map?.resize());
      this.observer.observe(this.container);

      this.applyMapStatus();
      this.startLoop();
      this.ready = true;
      this.hooks.onLoading?.({ step: 3, text: '场景资源加载完成' });
      this.hooks.onReady?.({ name: PARK_NAME });
      this.hooks.onToast?.('场景资源加载完成');
      if (!securityJsCode) {
        this.hooks.onToast?.('未配置安全密钥。若底图空白，请补上 VITE_AMAP_SECURITY_JS_CODE');
      }
      this.emitMode();
      this.emitView();
      window.__park = this;
    } catch (error) {
      console.error(error);
      this.hooks.onError?.(error instanceof Error ? error.message : '场景初始化失败');
    }
  }

  addControls(AMap: AMapNamespace) {
    try {
      this.map.addControl(new AMap.Scale({ position: 'LB' }));
      this.map.addControl(new AMap.ControlBar({
        position: { right: '12px', bottom: '16px' },
      }));
    } catch (error) {
      console.warn('地图控件初始化失败', error);
    }
  }

  /**
   * init 回调里只能做同步工作，渲染循环可能紧跟着进来。
   * 高德把已创建好的 WebGL1 上下文传进来，Three r163 起不再接受 WebGL1，所以这里锁定 0.162。
   */
  setupGL(gl: WebGLRenderingContext) {
    this.renderer = new THREE.WebGLRenderer({ context: gl });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 1 << 30);
    this.world = new ParkWorld(this.scene, this.coord);
  }

  renderGL() {
    if (!this.renderer || !this.world || !this.camera) return;
    try {
      const size = this.map.getSize();
      this.renderer.resetState();
      syncMapCamera(
        this.coord.customCoords,
        this.camera,
        this.coord.center,
        size.width / Math.max(1, size.height),
      );
      const gl = this.renderer.getContext();
      this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      this.renderer.clearDepth();
      this.world.updateLod(this.camera);
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();
    } catch (error) {
      if (!this.renderFailed) {
        this.renderFailed = true;
        console.error(error);
        const text = error instanceof Error ? error.message : String(error);
        this.hooks.onToast?.(`三维渲染异常：${text}`);
      }
    }
  }

  syncCamera() {
    if (!this.camera || !this.map || !this.coord) return;
    const size = this.map.getSize();
    syncMapCamera(
      this.coord.customCoords,
      this.camera,
      this.coord.center,
      size.width / Math.max(1, size.height),
    );
  }

  setupOverlays(AMap: AMapNamespace) {
    const markers = devices.map((device) => {
      const marker = new AMap.CircleMarker({
        center: [device.lng, device.lat],
        radius: 5,
        strokeColor: '#081018',
        strokeWeight: 1,
        fillColor: STATUS_HEX[statusKey(device)],
        fillOpacity: 0.95,
        zIndex: 160,
        bubble: false,
        cursor: 'pointer',
        zooms: [15.5, 20],
      });
      marker.on?.('click', () => this.selectKind('device', device));
      this.markerById.set(device.id, marker);
      return marker;
    });
    this.deviceOverlay = new AMap.OverlayGroup(markers);

    const labels = [
      ...buildings.map((building) => this.makeLabel(AMap, building, () => this.selectKind('building', building))),
      ...gates.map((gate) => this.makeLabel(AMap, gate, () => this.selectKind('gate', gate))),
    ];
    this.buildingOverlay = new AMap.OverlayGroup(labels);
    this.map.add(this.deviceOverlay);
    this.map.add(this.buildingOverlay);

    this.heatmap = new AMap.HeatMap(this.map, {
      radius: 36,
      opacity: [0, 0.8],
      zIndex: 4,
      gradient: {
        0.2: '#1d4ed8',
        0.45: '#22d3ee',
        0.7: '#facc15',
        1: '#ef4444',
      },
    });
    this.heatmap.setDataSet({
      data: heatPoints.map((point) => ({ lng: point.lng, lat: point.lat, count: point.count })),
      max: 100,
    });
    this.heatmap.hide?.();

    this.layers.register('building', this.world.buildingGroup);
    this.layers.register('building', this.buildingOverlay);
    this.layers.register('device', this.world.deviceGroup);
    this.layers.register('device', this.deviceOverlay);
    this.layers.register('pipe', this.world.pipeGroup);
    this.layers.register('alarm', this.world.alarmGroup);
    this.layers.register('flyline', this.world.flylineGroup);
    this.layers.register('heat', this.heatmap);
    this.layers.register('measure', {
      show: () => this.interaction.setMeasureVisible(true),
      hide: () => this.interaction.setMeasureVisible(false),
    });
  }

  makeLabel(AMap: AMapNamespace, item: NamedPlace, onClick: () => void) {
    const text = new AMap.Text({
      text: item.name,
      position: [item.lng, item.lat],
      offset: new AMap.Pixel(0, -8),
      zooms: [16.2, 20],
      zIndex: 150,
      bubble: false,
      style: labelStyle(false),
    });
    text.on?.('click', onClick);
    this.labelById.set(item.id, text);
    return text;
  }

  bindMapHold() {
    this.map.on('mousedown', () => {
      this.cameraCtrl.hold(true);
      if (this.roamMode === 'free') this.cameraCtrl.cancelFly();
    });
    this.map.on('mouseup', () => this.cameraCtrl.hold(false));
  }

  startLoop() {
    const step = (now: number) => {
      this.raf = requestAnimationFrame(step);
      if (!this.map || document.hidden) return;
      const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      const time = this.clock.getElapsedTime();
      this.world.updateEffects(time);
      const spin = this.autoRotate && this.roamMode === 'free' && this.measureMode === 'none' && !this.boxMode;
      this.cameraCtrl.update(dt, spin);
      if (this.heatVisible && now - this.lastHeat > 1200) {
        this.lastHeat = now;
        this.pushHeat(time);
      }
      this.map.render();
      if (now - this.lastView > 260) {
        this.lastView = now;
        this.emitView();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  pushHeat(time: number) {
    if (!this.heatmap?.setDataSet) return;
    this.heatmap.setDataSet({
      max: 100,
      data: heatPoints.map((point, index) => ({
        lng: point.lng,
        lat: point.lat,
        count: Math.max(6, point.count + Math.sin(time * 0.7 + index) * 14),
      })),
    });
  }

  emitView() {
    if (!this.map || !this.camera) return;
    this.hooks.onView?.({
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      rotation: this.map.getRotation(),
      lod: this.world.lodState(this.camera),
    });
  }

  emitMode() {
    this.hooks.onMode?.({
      roamMode: this.roamMode,
      measureMode: this.measureMode,
      boxMode: this.boxMode,
      autoRotate: this.autoRotate,
      timeMode: this.timeMode,
      measureHint: this.interaction?.measure.hint || '',
    });
  }

  onAlarmChange() {
    this.world.syncGlow();
    this.world.refreshBulbs();
    this.refreshMarkers();
    this.hooks.onStats?.(this.alarms.getStats());
    this.hooks.onAlarms?.(this.alarms.getRecords());
    if (this.selection?.kind === 'device' && this.selection.id) {
      const device = this.lookup.devices.get(this.selection.id);
      if (device) this.applySelection(this.present('device', device));
    }
  }

  setLayer(name: LayerName, visible: boolean) {
    this.layers.setVisible(name, visible);
    if (name === 'alarm') this.world.setAlarmVisible(visible);
    if (name === 'heat') this.heatVisible = visible;
    this.hooks.onLayers?.({ ...this.layers.state });
  }

  setRoamMode(mode: RoamMode) {
    if (this.roamMode === mode) return;
    if (mode === 'fps') {
      this.boxMode = false;
      this.interaction.setBoxMode(false);
      this.autoRotate = false;
    }
    this.roamMode = mode;
    this.cameraCtrl.setMode(mode);
    this.applyMapStatus();
    this.emitMode();
    if (mode === 'fps') this.hooks.onToast?.('第一人称：WASD 移动，鼠标转向，Shift 加速，滚轮缩放，Esc 退出');
  }

  setAutoRotate(enabled: boolean) {
    if (enabled && this.roamMode === 'fps') this.setRoamMode('free');
    this.autoRotate = enabled;
    this.emitMode();
  }

  setBoxMode(enabled: boolean) {
    if (enabled && this.roamMode === 'fps') this.setRoamMode('free');
    if (enabled && this.measureMode !== 'none') {
      this.measureMode = 'none';
      this.interaction.setMeasureMode('none');
    }
    this.boxMode = enabled;
    this.interaction.setBoxMode(enabled);
    this.applyMapStatus();
    this.emitMode();
  }

  setMeasureMode(mode: MeasureMode) {
    if (mode !== 'none' && this.roamMode === 'fps') this.setRoamMode('free');
    if (mode !== 'none' && this.boxMode) {
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

  setTimeOfDay(mode: TimeMode) {
    this.timeMode = mode;
    this.world.setTimeOfDay(mode);
    this.map.setMapStyle(mode === 'night' ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke');
    this.world.highlight(this.selection);
    this.emitMode();
    if (this.selection?.kind === 'device') this.onAlarmChange();
  }

  clearAlarms() {
    this.alarms.clearAll();
    this.hooks.onToast?.('已清除全部告警');
  }

  resetDevices() {
    this.alarms.resetAll();
    this.world.setTimeOfDay(this.timeMode);
    this.world.highlight(this.selection);
    if (this.selection?.kind === 'device' && this.selection.id) {
      const device = this.lookup.devices.get(this.selection.id);
      if (device) this.applySelection(this.present('device', device));
    } else {
      this.refreshMarkers();
    }
    this.hooks.onToast?.('已重置全部设备状态');
  }

  flyPreset(name: PresetName) {
    const preset = presetTarget(name);
    if (!preset) return;
    if (this.roamMode === 'fps') this.setRoamMode('free');
    this.cameraCtrl.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      pitch: preset.pitch,
      rotation: preset.rotation,
    });
  }

  resetView() {
    this.flyPreset('global');
  }

  focusAlarm(deviceId: string) {
    const device = this.lookup.devices.get(deviceId);
    if (!device) return;
    if (this.roamMode === 'fps') this.setRoamMode('free');
    this.selectKind('device', device, { strong: true });
  }

  selectResolved(resolved: ResolvedHit | null) {
    if (!resolved) {
      this.clearSelection();
      return;
    }
    this.selectKind(resolved.kind, resolved.data);
  }

  selectBox(list: Device[]) {
    if (!list.length) {
      this.hooks.onToast?.('框选范围内没有设备');
      return;
    }
    this.applySelection(presentMulti(list));
  }

  selectKind(kind: EntityKind, data: ParkEntity | undefined, options: { strong?: boolean; fly?: boolean } = {}) {
    if (!data) return;
    this.applySelection(this.present(kind, data));
    if (options.fly !== false) this.flyToEntity(kind, data, options.strong);
  }

  present(kind: EntityKind, data: ParkEntity): SelectionPayload {
    let payload: SelectionPayload;
    if (kind === 'building') payload = presentBuilding(data as Building);
    else if (kind === 'device') payload = presentDevice(data as Device);
    else if (kind === 'pipe') payload = presentPipe(data as Pipe);
    else payload = presentGate(data as Gate);
    if (kind === 'device') payload.ids = [data.id];
    if (kind === 'building') payload.custom = Boolean(this.world.records.get(data.id)?.custom);
    return payload;
  }

  applySelection(payload: SelectionPayload) {
    this.selection = payload;
    this.world.highlight(payload);
    this.refreshMarkers();
    this.hooks.onSelect?.(payload);
  }

  clearSelection() {
    this.selection = null;
    this.world.highlight(null);
    this.refreshMarkers();
    this.hooks.onSelect?.(null);
  }

  flyToEntity(kind: EntityKind, data: { lng: number; lat: number }, strong?: boolean) {
    const view = this.cameraCtrl.snapshot();
    this.cameraCtrl.flyTo({
      center: [data.lng, data.lat],
      zoom: strong ? 18.55 : Math.max(view.zoom, kind === 'device' ? 18.15 : 17.7),
      pitch: strong ? 64 : Math.max(view.pitch, 50),
      rotation: view.rotation,
    });
  }

  refreshMarkers() {
    const selected = this.world?.selectedIds || new Set<string>();
    const buildingId = this.selection?.kind === 'building' ? this.selection.id : null;
    const gateId = this.selection?.kind === 'gate' ? this.selection.id : null;
    this.markerById.forEach((marker, id) => {
      const device = this.lookup.devices.get(id);
      if (!device) return;
      const on = selected.has(id);
      marker.setOptions?.({
        fillColor: on ? STATUS_HEX.selected : STATUS_HEX[statusKey(device)],
        radius: on ? 8 : 5,
      });
    });
    this.labelById.forEach((label, id) => {
      label.setStyle?.(labelStyle(id === buildingId || id === gateId));
    });
  }

  async loadModelFile(file: File) {
    const buildingId = this.selection?.kind === 'building' ? this.selection.id : null;
    if (!buildingId) {
      this.hooks.onToast?.('请先点选一座建筑，再加载 GLB / GLTF');
      return;
    }
    if (!/\.glb$|\.gltf$/i.test(file.name)) {
      this.hooks.onToast?.('请选择 .glb 或 .gltf 文件');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      this.hooks.onToast?.('正在解析模型…');
      const record = this.world.records.get(buildingId);
      if (!record) return;
      const holder = await this.modelLoader.loadFitted(url, {
        w: record.data.w,
        d: record.data.d,
        h: record.data.height,
      });
      this.world.attachModel(buildingId, holder);
      this.selectKind('building', record.data, { fly: false });
      this.hooks.onToast?.(`已用 ${file.name} 替换「${record.data.name}」`);
    } catch (error) {
      console.error(error);
      const text = error instanceof Error ? error.message : String(error);
      this.hooks.onToast?.(`模型加载失败：${text}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  restoreModel() {
    const buildingId = this.selection?.kind === 'building' ? this.selection.id : null;
    if (!buildingId) {
      this.hooks.onToast?.('请先点选一座建筑');
      return;
    }
    if (!this.world.records.get(buildingId)?.custom) {
      this.hooks.onToast?.('这座建筑当前就是白模');
      return;
    }
    this.world.detachModel(buildingId);
    this.selectKind('building', this.lookup.buildings.get(buildingId), { fly: false });
    this.hooks.onToast?.('已恢复白模');
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
    else if (this.boxMode || this.measureMode !== 'none') this.container.style.cursor = 'crosshair';
    else this.container.style.cursor = '';
  }

  handleKey(event: KeyboardEvent) {
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (this.roamMode === 'fps' && MOVE_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Digit1') this.flyPreset('global');
    if (event.code === 'Digit2') this.flyPreset('building');
    if (event.code === 'Digit3') this.flyPreset('gate');
    if (event.code === 'Digit0' || (event.code === 'KeyR' && this.roamMode !== 'fps')) this.resetView();
    if (event.code === 'KeyN') this.setTimeOfDay(this.timeMode === 'night' ? 'day' : 'night');
    if (event.code === 'KeyB') this.setBoxMode(!this.boxMode);
    if (event.code === 'Escape') {
      if (this.roamMode === 'fps') this.setRoamMode('free');
      else if (this.boxMode) this.setBoxMode(false);
      else if (this.measureMode !== 'none') this.setMeasureMode('none');
      else this.clearSelection();
    }
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.alarms?.stop();
    this.observer?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    this.container?.removeEventListener('dragover', this.onDragOver);
    this.container?.removeEventListener('drop', this.onDrop);
    this.interaction?.dispose();
    this.cameraCtrl?.dispose();
    this.world?.dispose();
    this.map?.destroy();
    if (window.__park === this) delete window.__park;
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
    'background-color': active ? 'rgba(29, 78, 216, 0.9)' : 'rgba(8, 16, 32, 0.78)',
    border: active ? '1px solid #93c5fd' : '1px solid rgba(148, 176, 214, 0.4)',
    color: '#e8f1ff',
    'font-size': '12px',
    padding: '2px 6px',
    'border-radius': '2px',
    'white-space': 'nowrap',
  };
}
