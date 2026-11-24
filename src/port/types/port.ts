import type { LngLat, RoamMode } from '../../types/geo';

export type { LngLat, RoamMode };

/** 箱型只影响尺寸和详情，颜色按箱状态区分。 */
export type BoxType = '20GP' | '40GP' | '40HC';
export type BoxStatus = 'empty' | 'heavy' | 'pickup' | 'loadship';
export type AlarmLevel = 'info' | 'warning' | 'urgent';
export type AlarmKind = 'crane' | 'congestion' | 'yard' | 'gate';
export type CraneStatus = 'idle' | 'working' | 'fault';
export type TruckState = 'run' | 'dwell' | 'stop';

export type LayerName =
  | 'crane'
  | 'container'
  | 'truck'
  | 'road'
  | 'alarm'
  | 'flow'
  | 'trail'
  | 'water'
  | 'facility'
  | 'measure';

export type MeasureMode = 'none' | 'distance' | 'area' | 'text';
export type TimeMode = 'day' | 'night';
export type PresetName = 'overview' | 'berth' | 'yard' | 'gate';
export type PanelTab = 'board' | 'layers' | 'alarms' | 'legend' | 'bookmarks';
export type EntityKind = 'crane' | 'truck' | 'container' | 'weigh' | 'gate' | 'camera';

export interface MeterPoint {
  x: number;
  y: number;
  stop?: boolean;
  label?: string;
}

export interface BlockDef {
  id: string;
  name: string;
  originX: number;
  originY: number;
  rows: number;
  bays: number;
  bayPitch: number;
  rowPitch: number;
  maxTier: number;
}

export interface ContainerUnit {
  id: string;
  boxType: BoxType;
  status: BoxStatus;
  blockId: string;
  blockName: string;
  x: number;
  y: number;
  z: number;
  wx: number;
  wy: number;
  wz: number;
  lng: number;
  lat: number;
  hidden: boolean;
  reserved: boolean;
  instanceIndex: number;
}

export interface CraneUnit {
  id: string;
  name: string;
  berthId: string;
  berthName: string;
  homeEast: number;
  homeNorth: number;
  east: number;
  north: number;
  lng: number;
  lat: number;
  status: CraneStatus;
  task: string;
}

export interface TruckUnit {
  id: string;
  name: string;
  routeId: string;
  state: TruckState;
  task: string;
  dest: string;
  speed: number;
  east: number;
  north: number;
  lng: number;
  lat: number;
  heading: number;
}

export interface BerthUnit {
  id: string;
  name: string;
  ship: string;
  east: number;
  north: number;
  lng: number;
  lat: number;
}

export interface FacilityUnit {
  id: string;
  name: string;
  kind: 'camera' | 'lamp' | 'weigh' | 'gate';
  east: number;
  north: number;
  lng: number;
  lat: number;
  status: string;
  task: string;
  dest: string;
}

export interface LaneSeg {
  id: string;
  name: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface JobLog {
  id: string;
  time: number;
  timeText: string;
  craneId: string;
  containerId: string;
  text: string;
}

export interface WorkTask {
  id: string;
  title: string;
  detail: string;
  state: '进行中' | '待作业';
  craneId: string;
  containerId: string;
}

export interface BlockStat {
  id: string;
  name: string;
  count: number;
  capacity: number;
  rate: number;
  east: number;
  north: number;
}

export interface AlarmRecord {
  id: string;
  level: AlarmLevel;
  kind: AlarmKind;
  title: string;
  message: string;
  targetId: string;
  east: number;
  north: number;
  time: number;
  timeText: string;
}

export interface PortStats {
  berthRate: number;
  berthText: string;
  yardBoxes: number;
  yardCapacity: number;
  trucksInPort: number;
  trucksMoving: number;
  pendingJobs: number;
  info: number;
  warning: number;
  urgent: number;
  blocks: BlockStat[];
}

export interface InfoRow {
  label: string;
  value: string;
}

export interface SelectionItem {
  id: string;
  name: string;
  status: string;
}

export interface SelectionPayload {
  kind: EntityKind | 'multi';
  id: string | null;
  title: string;
  subtitle: string;
  badge: string;
  level: AlarmLevel | 'normal' | 'selected';
  rows: InfoRow[];
  lng?: number;
  lat?: number;
  items?: SelectionItem[];
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
  culled: string;
}

export interface ViewTarget {
  center: LngLat;
  zoom: number;
  pitch: number;
  rotation: number;
}

export interface Viewpoint extends ViewTarget {
  id: string;
  name: string;
}

export interface LayerState {
  crane: boolean;
  container: boolean;
  truck: boolean;
  road: boolean;
  alarm: boolean;
  flow: boolean;
  trail: boolean;
  water: boolean;
  facility: boolean;
  measure: boolean;
}

export interface SceneMode {
  roamMode: RoamMode;
  measureMode: MeasureMode;
  boxMode: boolean;
  timeMode: TimeMode;
  playing: boolean;
  speed: number;
  measureHint: string;
}

export interface ResolvedHit {
  kind: EntityKind;
  id: string;
  name: string;
}

export interface SceneHooks {
  onLoading?: (payload: { step: number; text: string }) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  onToast?: (text: string) => void;
  onStats?: (stats: PortStats) => void;
  onAlarms?: (list: AlarmRecord[]) => void;
  onLogs?: (list: JobLog[]) => void;
  onTasks?: (list: WorkTask[]) => void;
  onSelect?: (payload: SelectionPayload | null) => void;
  onPointer?: (info: PointerInfo) => void;
  onView?: (info: ViewInfo) => void;
  onMode?: (mode: SceneMode) => void;
  onLayers?: (layers: LayerState) => void;
}
