import type { Vector3 } from 'three';
import type { LngLat, RoamMode } from '../../types/geo';

export type { LngLat, RoamMode };
export type MeterPoint = [number, number];

/** 厂区设备。叉车点位是停靠位，移动中的叉车另见 ForkliftUnit。 */
export type DeviceType = 'camera' | 'hydrant' | 'meter' | 'access' | 'lamp' | 'dock';
export type AlarmLevel = 'info' | 'warning' | 'urgent';
export type DeviceStatus = 'normal' | AlarmLevel;
export type StatusKey = DeviceStatus | 'offline' | 'selected';

export type LayerName =
  | 'building'
  | 'wall'
  | 'device'
  | 'pipe'
  | 'alarm'
  | 'flyline'
  | 'forklift'
  | 'measure'
  | 'grid'
  | 'hazard';

export type MeasureMode = 'none' | 'distance' | 'area' | 'elevation' | 'text';
export type TimeMode = 'day' | 'night';
export type WeatherMode = 'clear' | 'fog' | 'rain';
export type PresetName = 'overview' | 'workshop' | 'hazard' | 'gate';
export type PanelTab = 'board' | 'layers' | 'alarms' | 'bookmarks' | 'legend';
export type EntityKind = 'building' | 'device' | 'pipe' | 'gate';
export type AlarmFilter = 'all' | AlarmLevel;

export interface Telemetry {
  temperature: number;
  pressure: number;
  humidity: number;
  updatedAt: number;
}

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  x: number;
  y: number;
  elev: number;
  online: boolean;
  status: DeviceStatus;
  buildingId: string;
  key: boolean;
  telemetry: Telemetry;
  lng: number;
  lat: number;
  zone: string;
  world?: Vector3;
  instanceIndex?: number;
  glowZ?: number;
  glowScale?: number;
}

export interface Building {
  id: string;
  name: string;
  usage: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floors: number;
  height: number;
  color: string;
  lng: number;
  lat: number;
  zone: string;
}

export interface Gate {
  id: string;
  name: string;
  x: number;
  y: number;
  lng: number;
  lat: number;
  zone: string;
  world?: Vector3;
}

export interface Road {
  id: string;
  name: string;
  width: number;
  points: MeterPoint[];
}

export interface Green {
  id: string;
  name: string;
  points: MeterPoint[];
}

export interface Pipe {
  id: string;
  name: string;
  medium: string;
  spec: string;
  diameter: string;
  depth: number;
  color: string;
  speed: number;
  load: string;
  path: MeterPoint[];
  mid: MeterPoint;
  lng: number;
  lat: number;
  length: number;
  world?: Vector3;
}

export interface HazardZone {
  id: string;
  name: string;
  buildingId: string;
  points: MeterPoint[];
}

export interface ForkliftUnit {
  id: string;
  name: string;
  speed: number;
  progress: number;
  route: MeterPoint[];
}

export interface BuildingShare {
  usage: string;
  area: number;
}

export interface Viewpoint {
  id: string;
  name: string;
  center: LngLat;
  zoom: number;
  pitch: number;
  rotation: number;
}

export interface ParkStats {
  total: number;
  online: number;
  offline: number;
  info: number;
  warning: number;
  urgent: number;
}

export interface AlarmRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  typeLabel: string;
  level: AlarmLevel;
  message: string;
  time: number;
  timeText: string;
  lng: number;
  lat: number;
}

export interface InfoRow {
  label: string;
  value: string;
}

export interface SelectionItem {
  id: string;
  name: string;
  status: string;
  level: StatusKey;
}

export interface SelectionPayload {
  kind: EntityKind | 'multi';
  id: string | null;
  title: string;
  subtitle: string;
  badge: string;
  level: StatusKey;
  rows: InfoRow[];
  lng?: number;
  lat?: number;
  items?: SelectionItem[];
  ids?: string[];
  custom?: boolean;
}

export interface PointerInfo {
  lng: number | null;
  lat: number | null;
  east: number | null;
  north: number | null;
  hover: string;
}

export interface ViewInfo {
  zoom: number;
  pitch: number;
  rotation: number;
  lod: string;
}

export interface SceneMode {
  roamMode: RoamMode;
  measureMode: MeasureMode;
  boxMode: boolean;
  autoRotate: boolean;
  timeMode: TimeMode;
  weather: WeatherMode;
  pipeGhost: boolean;
  showGrid: boolean;
  showRuler: boolean;
  forkliftSpeed: number;
  measureHint: string;
}

export type LayerState = Record<LayerName, boolean>;

export interface SceneHooks {
  onLoading?: (state: { step: number; text: string }) => void;
  onReady?: (info: { name: string }) => void;
  onError?: (message: string) => void;
  onToast?: (text: string) => void;
  onStats?: (stats: ParkStats) => void;
  onAlarms?: (list: AlarmRecord[]) => void;
  onSelect?: (payload: SelectionPayload | null) => void;
  onPointer?: (info: PointerInfo) => void;
  onView?: (info: ViewInfo) => void;
  onMode?: (mode: SceneMode) => void;
  onLayers?: (layers: LayerState) => void;
}

export type ResolvedHit =
  | { kind: 'device'; data: Device; name: string }
  | { kind: 'building'; data: Building; name: string }
  | { kind: 'pipe'; data: Pipe; name: string }
  | { kind: 'gate'; data: Gate; name: string };

export type ParkEntity = Building | Device | Pipe | Gate;
