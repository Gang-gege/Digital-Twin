import { metersToLngLat, polylineLength } from '../../utils/coord';
import type {
  Building,
  BuildingShare,
  Device,
  DeviceStatus,
  DeviceType,
  ForkliftUnit,
  Gate,
  Green,
  HazardZone,
  LngLat,
  MeterPoint,
  Pipe,
  PresetName,
  Road,
} from '../types/park';

/**
 * 澄源工业厂区 mock。
 * 平面用米（x 东、y 北，原点是厂区中心），再换成 GCJ-02。
 * 锚点仍在北京经开区附近，让白模落在真实路网上；厂房本身是虚构的电力 / 水务厂区。
 */

export const PARK_NAME = '澄源工业厂区';
export const PARK_CENTER: LngLat = [116.5068, 39.7955];
export const FLOOR_HEIGHT = 3.6;

export const DEVICE_TYPES: Record<DeviceType, { label: string }> = {
  camera: { label: '摄像头' },
  hydrant: { label: '消防栓' },
  meter: { label: '电表' },
  access: { label: '门禁' },
  lamp: { label: '路灯' },
  dock: { label: '叉车点位' },
};

export const PIPE_LEGEND = [
  { name: '给水', color: '#3aa0ff' },
  { name: '中水', color: '#2ec4b6' },
  { name: '污水', color: '#c08457' },
  { name: '电缆', color: '#f0b429' },
];

export const STATUS_LEGEND = [
  { name: '正常', color: '#3dbe8c' },
  { name: '提示', color: '#4aa3ff' },
  { name: '预警', color: '#f0b429' },
  { name: '紧急', color: '#ff5a62' },
  { name: '离线', color: '#64748b' },
];

const USAGE_COLOR: Record<string, string> = {
  生产: '#d5e2ea',
  办公: '#e4ebf2',
  仓储: '#e6e2d6',
  危化: '#f0d6d4',
  电力: '#e7dfc4',
  水务: '#d4e7e4',
};

function zoneOf(x: number, y: number) {
  if (Math.hypot(x, y) < 60) return '中心区';
  const ns = y >= 0 ? '北' : '南';
  const ew = x >= 0 ? '东' : '西';
  return `${ns}${ew}区`;
}

function locate<T extends { x: number; y: number; zone?: string }>(item: T): T & { lng: number; lat: number; zone: string } {
  const [lng, lat] = metersToLngLat(PARK_CENTER, item.x, item.y);
  return { ...item, lng, lat, zone: item.zone || zoneOf(item.x, item.y) };
}

const BUILDING_DEFS = [
  { id: 'P01', name: '一号生产车间', usage: '生产', x: -78, y: 42, w: 78, d: 32, floors: 2 },
  { id: 'P02', name: '二号生产车间', usage: '生产', x: 28, y: 46, w: 64, d: 30, floors: 2 },
  { id: 'P03', name: '组装车间', usage: '生产', x: -60, y: -36, w: 72, d: 26, floors: 1 },
  { id: 'O01', name: '调度办公楼', usage: '办公', x: 138, y: 78, w: 28, d: 16, floors: 6 },
  { id: 'W01', name: '成品仓库', usage: '仓储', x: 128, y: -18, w: 46, d: 28, floors: 1 },
  { id: 'W02', name: '原料仓库', usage: '仓储', x: 36, y: -92, w: 40, d: 24, floors: 1 },
  { id: 'H01', name: '危化品库', usage: '危化', x: -168, y: -72, w: 26, d: 16, floors: 1 },
  { id: 'E01', name: '配电中心', usage: '电力', x: 156, y: 132, w: 24, d: 16, floors: 2 },
  { id: 'T01', name: '水处理站', usage: '水务', x: -156, y: 86, w: 36, d: 22, floors: 2 },
  { id: 'B01', name: '循环泵房', usage: '水务', x: -156, y: 28, w: 22, d: 14, floors: 1 },
];

export const buildings: Building[] = BUILDING_DEFS.map((item) => locate({
  ...item,
  height: item.floors * FLOOR_HEIGHT,
  color: USAGE_COLOR[item.usage] || '#dce5ea',
}));

export function buildingShares(): BuildingShare[] {
  const area = new Map<string, number>();
  buildings.forEach((building) => {
    area.set(building.usage, (area.get(building.usage) || 0) + building.w * building.d);
  });
  return [...area.entries()].map(([usage, value]) => ({ usage, area: value }));
}

export const gates: Gate[] = [
  { id: 'G-S', name: '南门出入口', x: 0, y: -168 },
  { id: 'G-E', name: '东门物流口', x: 210, y: 8 },
  { id: 'G-W', name: '西门', x: -210, y: 8 },
].map((item) => locate(item));

export const roads: Road[] = [
  { id: 'R-EW', name: '纬一路', width: 12, points: [[-220, 0], [220, 0]] },
  { id: 'R-NS', name: '经一路', width: 12, points: [[0, -176], [0, 168]] },
  {
    id: 'R-RING',
    name: '环厂路',
    width: 8,
    points: [[-200, -150], [190, -150], [190, 150], [-200, 150], [-200, -150]],
  },
];

export const greens: Green[] = [
  { id: 'GR-N', name: '北侧林带', points: [[-190, 140], [-40, 158], [20, 140], [-160, 118]] },
  { id: 'GR-W', name: '水务绿地', points: [[-200, 48], [-176, 48], [-176, 112], [-200, 112]] },
  { id: 'GR-E', name: '办公前坪', points: [[112, 48], [168, 48], [168, 62], [112, 62]] },
  { id: 'GR-S', name: '南门绿化', points: [[-36, -158], [36, -158], [36, -142], [-36, -142]] },
];

export const hazards: HazardZone[] = [
  {
    id: 'HZ-01',
    name: '甲类危化存放区',
    buildingId: 'H01',
    points: [[-188, -88], [-148, -88], [-148, -54], [-188, -54]],
  },
];

export const boundary: MeterPoint[] = [[-220, -168], [220, -168], [220, 168], [-220, 168], [-220, -168]];

function makePipe(def: Omit<Pipe, 'mid' | 'lng' | 'lat' | 'length'>): Pipe {
  const mid = def.path[Math.floor((def.path.length - 1) / 2)] ?? def.path[0] ?? [0, 0];
  const [lng, lat] = metersToLngLat(PARK_CENTER, mid[0], mid[1]);
  return { ...def, mid, lng, lat, length: polylineLength(def.path) };
}

export const pipes: Pipe[] = [
  makePipe({
    id: 'PIPE-JS-01', name: '纬一路给水管', medium: '给水', spec: '市政引入', diameter: 'DN400',
    depth: -3.2, color: '#3aa0ff', speed: 0.45, load: '0.28 MPa',
    path: [[-200, 6], [-40, 6], [80, 6], [200, 6]],
  }),
  makePipe({
    id: 'PIPE-ZS-01', name: '中水回用管', medium: '中水', spec: '绿化回用', diameter: 'DN300',
    depth: -4.6, color: '#2ec4b6', speed: 0.32, load: '0.16 MPa',
    path: [[-150, 86], [-40, 40], [40, -20], [128, -18]],
  }),
  makePipe({
    id: 'PIPE-WS-01', name: '南区污水管', medium: '污水', spec: '重力流', diameter: 'DN600',
    depth: -7.2, color: '#c08457', speed: 0.22, load: '液位 38%',
    path: [[-160, -70], [-40, -120], [40, -140], [120, -140]],
  }),
  makePipe({
    id: 'PIPE-DL-01', name: '10kV 电缆管廊', medium: '电缆', spec: '10kV', diameter: '管廊 1.0m',
    depth: -2.4, color: '#f0b429', speed: 0.9, load: '54% 负荷',
    path: [[156, 132], [156, 40], [20, 40], [-78, 42], [-156, 28]],
  }),
];

function insideBuilding(x: number, y: number) {
  return buildings.some((building) => Math.abs(x - building.x) < building.w / 2 + 1.4 && Math.abs(y - building.y) < building.d / 2 + 1.4);
}

let deviceSeq = 0;
function makeDevice(type: DeviceType, x: number, y: number, extra: { buildingId?: string; key?: boolean } = {}): Device {
  deviceSeq += 1;
  const prefix: Record<DeviceType, string> = {
    camera: 'CAM', hydrant: 'HYD', meter: 'MTR', access: 'ACS', lamp: 'LMP', dock: 'DCK',
  };
  const elev: Record<DeviceType, number> = {
    camera: 3.4, hydrant: 0.9, meter: 1.4, access: 1.5, lamp: 6.2, dock: 0.4,
  };
  const id = `${prefix[type]}-${String(deviceSeq).padStart(2, '0')}`;
  return locate({
    id,
    type,
    name: `${DEVICE_TYPES[type].label} ${id}`,
    x,
    y,
    elev: elev[type],
    online: true,
    status: 'normal' as DeviceStatus,
    buildingId: extra.buildingId || '',
    key: Boolean(extra.key),
    telemetry: {
      temperature: 23 + (deviceSeq % 5),
      pressure: 0.24 + (deviceSeq % 4) * 0.03,
      humidity: 48 + (deviceSeq % 7),
      updatedAt: Date.now(),
    },
  });
}

function samples(a: MeterPoint, b: MeterPoint, step: number, side: number): MeterPoint[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < step) return [];
  const ux = dx / len;
  const uy = dy / len;
  const points: MeterPoint[] = [];
  for (let dist = step * 0.5; dist < len - step * 0.25; dist += step) {
    points.push([a[0] + ux * dist - uy * side, a[1] + uy * dist + ux * side]);
  }
  return points;
}

function buildDevices() {
  const list: Device[] = [];
  buildings.forEach((building) => {
    const y = building.y - building.d / 2 - 3;
    list.push(makeDevice('camera', building.x - 3, y, { buildingId: building.id, key: building.id === 'P01' }));
    list.push(makeDevice('access', building.x + 3.2, y, { buildingId: building.id, key: building.id === 'H01' }));
    if (building.usage === '电力' || building.usage === '水务') {
      list.push(makeDevice('meter', building.x, y - 1.5, { buildingId: building.id, key: building.id === 'E01' }));
    }
  });

  for (let x = -180; x <= 180; x += 45) list.push(makeDevice('hydrant', x, -10));
  [[-168, -72], [156, 132], [-156, 86]].forEach(([x, y]) => list.push(makeDevice('hydrant', x + 16, y)));

  roads.forEach((road) => {
    const step = road.id === 'R-RING' ? 70 : 40;
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const start = road.points[i];
      const end = road.points[i + 1];
      if (!start || !end) continue;
      samples(start, end, step, 9).forEach(([x, y]) => {
        if (insideBuilding(x, y)) return;
        if (gates.some((gate) => Math.hypot(gate.x - x, gate.y - y) < 12)) return;
        list.push(makeDevice('lamp', x, y));
      });
    }
  });

  [[108, -36], [148, -36], [118, -78], [168, 8]].forEach(([x, y], index) => {
    list.push(makeDevice('dock', x, y, { buildingId: index < 2 ? 'W01' : 'W02' }));
  });
  return list;
}

export const devices: Device[] = buildDevices();

function patchDevice(predicate: (device: Device) => boolean, patch: Partial<Device>) {
  const found = devices.find(predicate);
  if (!found) return;
  Object.assign(found, patch);
  if (patch.telemetry) found.telemetry = { ...found.telemetry, ...patch.telemetry };
}
patchDevice((device) => device.type === 'meter' && device.buildingId === 'E01', {
  status: 'warning',
  telemetry: { temperature: 53, pressure: 0.31, humidity: 44, updatedAt: Date.now() },
});
patchDevice((device) => device.type === 'hydrant', {
  status: 'urgent',
  telemetry: { temperature: 27, pressure: 0.86, humidity: 52, updatedAt: Date.now() },
});
patchDevice((device) => device.type === 'camera' && device.buildingId === 'P02', {
  status: 'info',
  telemetry: { temperature: 31, pressure: 0.22, humidity: 78, updatedAt: Date.now() },
});
patchDevice((device) => device.type === 'lamp', { online: false, status: 'normal' });

export const forklifts: ForkliftUnit[] = [
  { id: 'FK-01', name: '叉车 01', speed: 8, progress: 12, route: [[-180, -8], [170, -8], [170, -70], [-80, -70], [-180, -8]] },
  { id: 'FK-02', name: '叉车 02', speed: 6.5, progress: 40, route: [[90, -40], [160, -40], [160, 20], [90, 20], [90, -40]] },
  { id: 'FK-03', name: '叉车 03', speed: 7, progress: 8, route: [[-150, 20], [-40, 20], [-40, -50], [-150, -50], [-150, 20]] },
  { id: 'FK-04', name: '叉车 04', speed: 5.5, progress: 20, route: [[20, 70], [120, 70], [120, 10], [20, 10], [20, 70]] },
];

export const presets = {
  overview: { zoom: 16.7, pitch: 52, rotation: -24, target: PARK_CENTER },
  workshop: { zoom: 18.15, pitch: 62, rotation: 18, targetId: 'P01' },
  hazard: { zoom: 18.35, pitch: 58, rotation: -12, targetId: 'H01' },
  gate: { zoom: 18.4, pitch: 48, rotation: 2, targetId: 'G-S' },
};

export function presetTarget(name: PresetName) {
  const preset = presets[name];
  if (!preset) return null;
  if ('target' in preset) return { ...preset, center: preset.target };
  const pool: Array<Building | Gate> = [...buildings, ...gates];
  const found = pool.find((item) => item.id === preset.targetId);
  if (!found) return null;
  return { ...preset, center: [found.lng, found.lat] as LngLat };
}
