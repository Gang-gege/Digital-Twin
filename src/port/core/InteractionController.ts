import * as THREE from 'three';
import type { AMapEvent, AMapMap, AMapNamespace, AMapPixel } from '../../types/amap';
import type { ContainerUnit, EntityKind, FacilityUnit, MeasureMode, PointerInfo, TruckUnit } from '../types/port';
import { lngLatToMeters, syncMapCamera } from '../../utils/coord';
import { MeasureTool } from './MeasureTool';
import type { PortWorld } from './createWorld';

interface InteractionOptions {
  AMap: AMapNamespace;
  map: AMapMap;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  world: PortWorld;
  containerVisible: () => boolean;
  onSelect: (hit: { kind: EntityKind; id: string; name: string } | null) => void;
  onBox: (list: ContainerUnit[]) => void;
  onPointer: (info: PointerInfo) => void;
}

interface PickData {
  pickType?: 'crane' | 'container' | 'truck' | 'weigh' | 'camera' | 'gate';
  id?: string;
  items?: Array<ContainerUnit | TruckUnit | FacilityUnit>;
}

/**
 * 单击拾取岸桥、集卡、集装箱、地磅，以及框选一片箱。
 * 射线前会先把高德相机写进 Three，避免点到上一帧的位置。
 */
export class InteractionController {
  declare map: AMapMap;
  declare camera: THREE.PerspectiveCamera;
  declare dom: HTMLElement;
  declare world: PortWorld;
  declare containerVisible: () => boolean;
  declare onSelect: InteractionOptions['onSelect'];
  declare onBox: InteractionOptions['onBox'];
  declare onPointer: InteractionOptions['onPointer'];
  declare raycaster: THREE.Raycaster;
  declare pointer: THREE.Vector2;
  declare measure: MeasureTool;
  declare boxMode: boolean;
  declare dragging: boolean;
  declare start: { x: number; y: number };
  declare current: { x: number; y: number };
  declare lastMove: number;
  declare boxEl: HTMLDivElement;
  declare onClick: (event: AMapEvent) => void;
  declare onDbl: () => void;
  declare onRight: () => void;
  declare onMove: (event: AMapEvent) => void;
  declare onDown: (event: MouseEvent) => void;
  declare onWindowMove: (event: MouseEvent) => void;
  declare onWindowUp: () => void;
  declare onMenu: (event: MouseEvent) => void;

  constructor(options: InteractionOptions) {
    this.map = options.map;
    this.camera = options.camera;
    this.dom = options.dom;
    this.world = options.world;
    this.containerVisible = options.containerVisible;
    this.onSelect = options.onSelect;
    this.onBox = options.onBox;
    this.onPointer = options.onPointer;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.measure = new MeasureTool({ AMap: options.AMap, map: options.map, center: options.world.coord.center });
    this.boxMode = false;
    this.dragging = false;
    this.start = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
    this.lastMove = 0;
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'select-box';
    this.dom.appendChild(this.boxEl);
    this.bind();
  }

  bind() {
    this.onClick = (event) => this.handleClick(event);
    this.onDbl = () => this.measure.finish();
    this.onRight = () => this.measure.finish();
    this.onMove = (event) => this.handleMove(event);
    this.onDown = (event) => this.handleDown(event);
    this.onWindowMove = (event) => {
      if (!this.dragging) return;
      this.current = this.localPoint(event);
      this.placeBox();
    };
    this.onWindowUp = () => this.handleUp();
    this.onMenu = (event) => {
      if (this.measure.mode !== 'none' || this.boxMode) event.preventDefault();
    };
    this.map.on('click', this.onClick);
    this.map.on('dblclick', this.onDbl);
    this.map.on('rightclick', this.onRight);
    this.map.on('mousemove', this.onMove);
    this.dom.addEventListener('mousedown', this.onDown, true);
    window.addEventListener('mousemove', this.onWindowMove);
    window.addEventListener('mouseup', this.onWindowUp);
    this.dom.addEventListener('contextmenu', this.onMenu);
  }

  dispose() {
    this.map.off('click', this.onClick);
    this.map.off('dblclick', this.onDbl);
    this.map.off('rightclick', this.onRight);
    this.map.off('mousemove', this.onMove);
    this.dom.removeEventListener('mousedown', this.onDown, true);
    window.removeEventListener('mousemove', this.onWindowMove);
    window.removeEventListener('mouseup', this.onWindowUp);
    this.dom.removeEventListener('contextmenu', this.onMenu);
    this.boxEl.remove();
    this.measure.clear();
  }

  setBoxMode(enabled: boolean) {
    this.boxMode = enabled;
    if (!enabled) this.boxEl.style.display = 'none';
  }

  setMeasureMode(mode: MeasureMode) {
    return this.measure.setMode(mode);
  }

  setAnnotation(text: string) {
    this.measure.setAnnotation(text);
  }

  clearMeasure() {
    this.measure.clear();
  }

  setMeasureVisible(visible: boolean) {
    this.measure.setVisible(visible);
  }

  handleClick(event: AMapEvent) {
    if (this.boxMode || this.dragging) return;
    const mode = this.measure.mode;
    if (mode === 'distance' || mode === 'area') {
      this.measure.addPoint(event.lnglat);
      return;
    }
    if (mode === 'text') {
      this.measure.addLabel(event.lnglat);
      return;
    }
    this.onSelect(this.resolve(this.raycast(event.pixel)));
  }

  handleMove(event: AMapEvent) {
    const now = performance.now();
    if (now - this.lastMove < 80) return;
    this.lastMove = now;
    const lng = event.lnglat.getLng?.() ?? event.lnglat.lng;
    const lat = event.lnglat.getLat?.() ?? event.lnglat.lat;
    const local = lngLatToMeters(this.world.coord.center, lng, lat);
    let hover = '';
    if (!this.dragging && !this.boxMode && this.measure.mode === 'none') {
      hover = this.resolve(this.raycast(event.pixel))?.name || '';
    }
    this.onPointer({ lng, lat, east: local.east, north: local.north, hover });
  }

  handleDown(event: MouseEvent) {
    if (!this.boxMode || event.button !== 0) return;
    this.dragging = true;
    this.start = this.localPoint(event);
    this.current = this.start;
    this.boxEl.style.display = 'block';
    this.placeBox();
    event.preventDefault();
    event.stopPropagation();
  }

  handleUp() {
    if (!this.dragging) return;
    this.dragging = false;
    const rect = normalize(this.start, this.current);
    this.boxEl.style.display = 'none';
    if (rect.w < 6 && rect.h < 6) return;
    this.onBox(this.containersIn(rect));
  }

  containersIn(rect: { x: number; y: number; w: number; h: number }) {
    if (!this.containerVisible()) return [];
    this.syncCamera();
    const size = this.map.getSize();
    const selected: ContainerUnit[] = [];
    this.world.containers.forEach((box) => {
      if (box.hidden) return;
      const projected = new THREE.Vector3(box.wx, box.wy, box.wz).project(this.camera);
      if (projected.z > 1) return;
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) selected.push(box);
    });
    return selected;
  }

  raycast(pixel?: AMapPixel) {
    if (!pixel) return null;
    this.syncCamera();
    const size = this.map.getSize();
    this.pointer.x = (pixel.x / size.width) * 2 - 1;
    this.pointer.y = -(pixel.y / size.height) * 2 + 1;
    this.world.craneGroup.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.getPickables(), true);
    return hits.find((hit) => hit.object.userData?.pickType || hit.object.parent) || hits[0] || null;
  }

  resolve(hit: THREE.Intersection | null) {
    if (!hit) return null;
    const owner = findPick(hit.object);
    if (!owner) return null;
    const data = owner.userData as PickData;
    if (data.pickType === 'container' || data.pickType === 'truck' || data.pickType === 'weigh' || data.pickType === 'camera') {
      const item = hit.instanceId == null ? undefined : data.items?.[hit.instanceId];
      if (!item || ('hidden' in item && item.hidden)) return null;
      const kind: EntityKind = data.pickType === 'container'
        ? 'container'
        : data.pickType === 'truck'
          ? 'truck'
          : data.pickType === 'weigh'
            ? 'weigh'
            : 'camera';
      return { kind, id: item.id, name: 'name' in item ? item.name : item.id };
    }
    if ((data.pickType === 'crane' || data.pickType === 'gate') && data.id) {
      const name = data.pickType === 'gate' ? '北闸口' : this.world.craneUnits.find((crane) => crane.id === data.id)?.name || data.id;
      return { kind: data.pickType, id: data.id, name };
    }
    return null;
  }

  syncCamera() {
    const size = this.map.getSize();
    syncMapCamera(
      this.world.coord.customCoords,
      this.camera,
      this.world.coord.center,
      size.width / Math.max(1, size.height),
    );
  }

  localPoint(event: MouseEvent) {
    const rect = this.dom.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  placeBox() {
    const rect = normalize(this.start, this.current);
    this.boxEl.style.left = `${rect.x}px`;
    this.boxEl.style.top = `${rect.y}px`;
    this.boxEl.style.width = `${rect.w}px`;
    this.boxEl.style.height = `${rect.h}px`;
  }
}

function findPick(object: THREE.Object3D | null): THREE.Object3D | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData?.pickType) return current;
    current = current.parent;
  }
  return null;
}

function normalize(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
