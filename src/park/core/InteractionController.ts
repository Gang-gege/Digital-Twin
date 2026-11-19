import * as THREE from 'three';
import type { AMapEvent, AMapMap, AMapNamespace, AMapPixel } from '../../types/amap';
import type { Building, Device, Gate, LngLat, MeasureMode, Pipe, PointerInfo, ResolvedHit } from '../types/park';
import { lngLatToMeters } from '../../utils/coord';
import { MeasureTool } from './MeasureTool';

interface Lookup {
  buildings: Map<string, Building>;
  devices: Map<string, Device>;
  pipes: Map<string, Pipe>;
  gates: Map<string, Gate>;
}

interface InteractionOptions {
  AMap: AMapNamespace;
  map: AMapMap;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  center: LngLat;
  syncCamera: () => void;
  getPickables: () => THREE.Object3D[];
  lookup: Lookup;
  deviceVisible?: () => boolean;
  onSelect: (hit: ResolvedHit | null) => void;
  onBox: (devices: Device[]) => void;
  onPointer: (info: PointerInfo) => void;
}

interface PickUserData {
  pickType?: 'device' | 'building' | 'pipe' | 'gate';
  id?: string;
  devices?: Device[];
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 交互：单击拾取、框选设备、把测量点击转给 MeasureTool。
 * 拾取前会先同步一次高德相机，否则射线还停在上一帧的镜头上。
 */
export class InteractionController {
  declare map: AMapMap;
  declare camera: THREE.PerspectiveCamera;
  declare dom: HTMLElement;
  declare center: LngLat;
  declare syncCamera: () => void;
  declare getPickables: () => THREE.Object3D[];
  declare lookup: Lookup;
  declare deviceVisible: () => boolean;
  declare onSelect: (hit: ResolvedHit | null) => void;
  declare onBox: (devices: Device[]) => void;
  declare onPointer: (info: PointerInfo) => void;
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
    this.center = options.center;
    this.syncCamera = options.syncCamera;
    this.getPickables = options.getPickables;
    this.lookup = options.lookup;
    this.deviceVisible = options.deviceVisible || (() => true);
    this.onSelect = options.onSelect;
    this.onBox = options.onBox;
    this.onPointer = options.onPointer;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 1.2;
    this.pointer = new THREE.Vector2();
    this.measure = new MeasureTool({
      AMap: options.AMap,
      map: options.map,
      center: options.center,
    });
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
    this.onDbl = () => this.finishMeasure();
    this.onRight = () => this.finishMeasure();
    this.onMove = (event) => this.handleMove(event);
    this.onDown = (event) => this.handleDown(event);
    this.onWindowMove = (event) => this.handleDrag(event);
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
    if (!enabled) this.hideBox();
  }

  setMeasureMode(mode: MeasureMode) {
    return this.measure.setMode(mode);
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
    if (mode === 'elevation') {
      this.measure.addElevation(event.lnglat, this.heightAt(event.pixel));
      return;
    }
    const hit = this.raycast(event.pixel);
    this.onSelect(this.resolve(hit));
  }

  finishMeasure() {
    if (this.measure.mode === 'distance' || this.measure.mode === 'area') this.measure.finish();
  }

  handleMove(event: AMapEvent) {
    const now = performance.now();
    if (now - this.lastMove < 70) return;
    this.lastMove = now;
    const lng = event.lnglat.getLng?.() ?? event.lnglat.lng;
    const lat = event.lnglat.getLat?.() ?? event.lnglat.lat;
    const local = lngLatToMeters(this.center, lng, lat);
    let hover = '';
    if (!this.dragging && !this.boxMode && this.measure.mode === 'none') {
      const hit = this.raycast(event.pixel);
      hover = this.resolve(hit)?.name || '';
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

  handleDrag(event: MouseEvent) {
    if (!this.dragging) return;
    this.current = this.localPoint(event);
    this.placeBox();
  }

  handleUp() {
    if (!this.dragging) return;
    this.dragging = false;
    const rect = normalize(this.start, this.current);
    this.hideBox();
    if (rect.w < 6 && rect.h < 6) return;
    this.onBox(this.devicesIn(rect));
  }

  devicesIn(rect: BoxRect) {
    if (!this.deviceVisible()) return [];
    this.syncCamera();
    const size = this.map.getSize();
    const selected: Device[] = [];
    this.lookup.devices.forEach((device) => {
      if (!device.world) return;
      const projected = device.world.clone();
      projected.z = Math.max(device.elev * 0.45, 1.2);
      projected.project(this.camera);
      if (projected.z > 1) return;
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        selected.push(device);
      }
    });
    return selected;
  }

  heightAt(pixel?: AMapPixel) {
    const resolved = this.resolve(this.raycast(pixel));
    if (!resolved) return 0;
    if (resolved.kind === 'building') return resolved.data.height;
    if (resolved.kind === 'device') return resolved.data.elev;
    if (resolved.kind === 'gate') return 4.2;
    if (resolved.kind === 'pipe') return resolved.data.depth;
    return 0;
  }

  raycast(pixel?: AMapPixel) {
    if (!pixel) return null;
    this.syncCamera();
    const size = this.map.getSize();
    this.pointer.x = (pixel.x / size.width) * 2 - 1;
    this.pointer.y = -(pixel.y / size.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.getPickables(), false);
    return hits[0] || null;
  }

  resolve(hit: THREE.Intersection | null): ResolvedHit | null {
    if (!hit) return null;
    const userData = (hit.object.userData || {}) as PickUserData;
    const { pickType, id, devices } = userData;
    if (pickType === 'device') {
      const data = hit.instanceId == null ? undefined : devices?.[hit.instanceId];
      return data ? { kind: 'device', data, name: data.name } : null;
    }
    if (pickType === 'building') {
      const data = id ? this.lookup.buildings.get(id) : undefined;
      return data ? { kind: 'building', data, name: data.name } : null;
    }
    if (pickType === 'pipe') {
      const data = id ? this.lookup.pipes.get(id) : undefined;
      return data ? { kind: 'pipe', data, name: data.name } : null;
    }
    if (pickType === 'gate') {
      const data = id ? this.lookup.gates.get(id) : undefined;
      return data ? { kind: 'gate', data, name: data.name } : null;
    }
    return null;
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

  hideBox() {
    this.boxEl.style.display = 'none';
  }
}

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): BoxRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
