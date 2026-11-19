import { metersToLngLat, polylineLength } from '../../utils/coord';
import type {
  Building,
  Device,
  DeviceStatus,
  DeviceType,
  Gate,
  Green,
  HeatPoint,
  LngLat,
  MeterPoint,
  Pipe,
  PresetName,
  Road,
} from '../types/park';

/**
 * 园区 mock 数据。
 * 平面布置用米（x 东、y 北，原点是园区中心），再换成 GCJ-02。
 * 锚点选在北京经开区附近，只为让白模落在真实路网上，建筑本身是虚构的演示布局。
 */

export const PARK_NAME = '星澜智慧园区';
export const PARK_CENTER: LngLat = [116.5068, 39.7955];
export const FLOOR_HEIGHT = 3.2;

export const DEVICE_TYPES: Record<DeviceType, { label: string; metric: string; unit: string }> = {
  camera: { label: '摄像头', metric: '码率', unit: 'Mbps' },
  charger: { label: '充电桩', metric: '功率', unit: 'kW' },
  access: { label: '门禁', metric: '通行', unit: '次/时' },
  lamp: { label: '路灯', metric: '亮度', unit: '%' },
};

export const PIPE_LEGEND = [
  { name: '给水', color: '#3aa0ff' },
  { name: '中水', color: '#2ec4b6' },
  { name: '电力', color: '#f0b429' },
  { name: '污水', color: '#c08457' },
];

const USAGE_COLOR: Record<string, string> = {
  研发办公: '#d7e4f5',
  实验: '#d5e7ea',
  数据机房: '#d3dced',
  办公: '#e3e9f2',
  配套: '#e7ebf1',
  生产: '#dde3ea',
  仓储: '#e4e1d8',
  公寓: '#e6e2ef',
  商业: '#f0e6dc',
};

const ALARM_TEXT: Record<DeviceType, { warning: string; alarm: string }> = {
  camera: { warning: '画面遮挡', alarm: '视频信号丢失' },
  charger: { warning: '温度偏高', alarm: '过温保护触发' },
  access: { warning: '多次验权失败', alarm: '强行开门' },
  lamp: { warning: '光源衰减', alarm: '灯具故障' },
};

export function alarmText(type: DeviceType, level: 'warning' | 'alarm') {
  return ALARM_TEXT[type]?.[level] || '状态异常';
}

function zoneOf(x: number, y: number) {
  if (Math.hypot(x, y) < 70) return '中心区';
  const ns = y >= 0 ? '北' : '南';
  const ew = x >= 0 ? '东' : '西';
  return `${ns}${ew}区`;
}

function locate<T extends { x: number; y: number; zone?: string }>(item: T): T & { lng: number; lat: number; zone: string } {
  const [lng, lat] = metersToLngLat(PARK_CENTER, item.x, item.y);
  return { ...item, lng, lat, zone: item.zone || zoneOf(item.x, item.y) };
}

const BUILDING_DEFS = [
  { id: 'B01', name: '研发中心 A 座', usage: '研发办公', x: -120, y: 95, w: 54, d: 30, floors: 14 },
  { id: 'B02', name: '研发中心 B 座', usage: '研发办公', x: -55, y: 108, w: 36, d: 28, floors: 11 },
  { id: 'B03', name: '实验楼', usage: '实验', x: -145, y: 28, w: 40, d: 22, floors: 6 },
  { id: 'B04', name: '数据中心', usage: '数据机房', x: 95, y: 115, w: 42, d: 34, floors: 8 },
  { id: 'B05', name: '综合办公楼', usage: '办公', x: 168, y: 78, w: 34, d: 26, floors: 16 },
  { id: 'B06', name: '会议中心', usage: '配套', x: 125, y: 32, w: 48, d: 22, floors: 4 },
  { id: 'B07', name: '生产厂房', usage: '生产', x: -125, y: -78, w: 72, d: 42, floors: 2 },
  { id: 'B08', name: '仓储中心', usage: '仓储', x: -40, y: -125, w: 46, d: 28, floors: 3 },
  { id: 'B09', name: '人才公寓', usage: '公寓', x: 108, y: -72, w: 32, d: 26, floors: 12 },
  { id: 'B10', name: '配套商业', usage: '商业', x: 175, y: -40, w: 28, d: 22, floors: 5 },
  { id: 'B11', name: '动力中心', usage: '配套', x: 78, y: -145, w: 30, d: 22, floors: 3 },
  { id: 'B12', name: '访客中心', usage: '配套', x: 46, y: -168, w: 22, d: 12, floors: 2 },
];

export const buildings: Building[] = BUILDING_DEFS.map((item) => locate({
  ...item,
  height: item.floors * FLOOR_HEIGHT,
  color: USAGE_COLOR[item.usage] || '#dce5f0',
}));

export const gates: Gate[] = [
  { id: 'G-S', name: '南门主入口', x: 0, y: -200 },
  { id: 'G-E', name: '东门', x: 230, y: 0 },
  { id: 'G-W', name: '西门', x: -230, y: 0 },
].map((item) => locate(item));

export const roads: Road[] = [
  { id: 'R-EW', name: '纬一路', width: 11, points: [[-240, 0], [240, 0]] },
  { id: 'R-NS', name: '经一路', width: 11, points: [[0, -210], [0, 210]] },
  {
    id: 'R-RING',
    name: '环园路',
    width: 8,
    points: [[-230, -200], [230, -200], [230, 200], [-230, 200], [-230, -200]],
  },
];

export const greens: Green[] = [
  { id: 'GR-N', name: '北侧林带', points: [[-220, 158], [-190, 208], [-60, 208], [-40, 162]] },
  { id: 'GR-E', name: '东北绿地', points: [[198, 145], [242, 145], [242, 205], [198, 205]] },
  { id: 'GR-SW', name: '西南草坪', points: [[-236, -192], [-168, -192], [-168, -164], [-236, -164]] },
  { id: 'GR-P1', name: '中心绿地北', points: [[28, 16], [82, 16], [82, 58], [28, 58]] },
  { id: 'GR-P2', name: '中心绿地南', points: [[28, -58], [82, -58], [82, -16], [28, -16]] },
  { id: 'GR-SE', name: '东南绿地', points: [[145, -125], [220, -125], [220, -82], [145, -82]] },
];

function makePipe(def: Omit<Pipe, 'mid' | 'lng' | 'lat' | 'length'>): Pipe {
  const mid = def.path[Math.floor((def.path.length - 1) / 2)] ?? def.path[0] ?? [0, 0];
  const [lng, lat] = metersToLngLat(PARK_CENTER, mid[0], mid[1]);
  return {
    ...def,
    mid,
    lng,
    lat,
    length: polylineLength(def.path),
  };
}

export const pipes: Pipe[] = [
  makePipe({
    id: 'PIPE-JS-01',
    name: '纬一路给水管',
    medium: '给水',
    spec: '市政引入',
    diameter: 'DN600',
    depth: -3.2,
    color: '#3aa0ff',
    speed: 0.55,
    load: '0.32 MPa',
    path: [[-220, 4], [-80, 4], [40, 4], [220, 4]],
  }),
  makePipe({
    id: 'PIPE-ZS-01',
    name: '经一路中水管',
    medium: '中水',
    spec: '绿化回用',
    diameter: 'DN400',
    depth: -5,
    color: '#2ec4b6',
    speed: 0.4,
    load: '0.18 MPa',
    path: [[5, -190], [5, -40], [5, 80], [5, 190]],
  }),
  makePipe({
    id: 'PIPE-DL-01',
    name: '环园电力管廊',
    medium: '电力',
    spec: '10kV',
    diameter: '管廊 1.2m',
    depth: -6.8,
    color: '#f0b429',
    speed: 0.85,
    load: '62% 负荷',
    path: [[-210, -180], [210, -180], [210, 180], [-210, 180], [-210, -180]],
  }),
  makePipe({
    id: 'PIPE-WS-01',
    name: '南区污水管',
    medium: '污水',
    spec: '重力流',
    diameter: 'DN800',
    depth: -8.2,
    color: '#c08457',
    speed: 0.28,
    load: '液位 41%',
    path: [[-125, -100], [-125, -190], [20, -190], [80, -190], [80, -145]],
  }),
];

const BOUNDARY: MeterPoint[] = [[-250, -220], [250, -220], [250, 220], [-250, 220], [-250, -220]];
export const boundary = BOUNDARY;

function insideBuilding(x: number, y: number) {
  return buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 1.2 && Math.abs(y - b.y) < b.d / 2 + 1.2);
}

function samples(a: MeterPoint, b: MeterPoint, step: number, side: number): MeterPoint[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < step) return [];
  const ux = dx / len;
  const uy = dy / len;
  const points: MeterPoint[] = [];
  for (let dist = step * 0.55; dist < len - step * 0.3; dist += step) {
    points.push([a[0] + ux * dist - uy * side, a[1] + uy * dist + ux * side]);
  }
  return points;
}

function metricSeed(type: DeviceType, index: number) {
  if (type === 'camera') return 2.4 + (index % 5) * 0.8;
  if (type === 'charger') return 18 + (index % 6) * 14;
  if (type === 'access') return 4 + (index % 7) * 3;
  return 0;
}

let deviceSeq = 0;
function makeDevice(type: DeviceType, x: number, y: number, extra: { buildingId?: string; key?: boolean } = {}): Device {
  deviceSeq += 1;
  const meta = DEVICE_TYPES[type];
  const prefix: Record<DeviceType, string> = { camera: 'CAM', charger: 'CHG', access: 'ACS', lamp: 'LMP' };
  const id = `${prefix[type]}-${String(deviceSeq).padStart(2, '0')}`;
  const elev: Record<DeviceType, number> = { camera: 3.3, charger: 1.6, access: 1.5, lamp: 6.3 };
  return locate({
    id,
    type,
    name: `${meta.label} ${id}`,
    x,
    y,
    elev: elev[type],
    online: true,
    status: 'normal' as DeviceStatus,
    buildingId: extra.buildingId || '',
    key: Boolean(extra.key),
    telemetry: {
      value: metricSeed(type, deviceSeq),
      temperature: 22 + (deviceSeq % 6),
      updatedAt: Date.now(),
    },
  });
}

function buildDevices() {
  const list: Device[] = [];

  buildings.forEach((b) => {
    const y = b.y - b.d / 2 - 2.8;
    list.push(makeDevice('camera', b.x - 2.2, y, { buildingId: b.id, key: b.id === 'B01' }));
    list.push(makeDevice('access', b.x + 2.4, y, { buildingId: b.id, key: b.id === 'B04' || b.id === 'B07' }));
  });

  const corners: MeterPoint[] = [[-216, -188], [216, -188], [216, 188], [-216, 188]];
  corners.forEach(([x, y]) => list.push(makeDevice('camera', x, y)));

  list.push(makeDevice('camera', 10, -190));
  list.push(makeDevice('camera', 218, 10));
  list.push(makeDevice('camera', -218, -10));
  gates.forEach((gate) => {
    const shift: MeterPoint = gate.id === 'G-S' ? [0, 3] : [0, 4];
    list.push(makeDevice('access', gate.x + shift[0], gate.y + shift[1], { key: gate.id === 'G-S' }));
  });

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      list.push(makeDevice('charger', -214 + col * 7.2, -148 - row * 8, { key: row === 0 && col === 2 }));
    }
  }

  const lampPoints: MeterPoint[] = [];
  roads.forEach((road) => {
    const step = road.id === 'R-RING' ? 72 : 36;
    const side = road.id === 'R-RING' ? 8 : 8;
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const start = road.points[i];
      const end = road.points[i + 1];
      if (!start || !end) continue;
      samples(start, end, step, side).forEach((p) => lampPoints.push(p));
    }
  });
  lampPoints.forEach(([x, y]) => {
    if (insideBuilding(x, y)) return;
    if (gates.some((g) => Math.hypot(g.x - x, g.y - y) < 10)) return;
    list.push(makeDevice('lamp', x, y));
  });

  return list;
}

export const devices: Device[] = buildDevices();

// 打开页面时就有几条告警和离线，看板不是空的。索引写死，刷新布局不会随机换设备。
function patchDevice(predicate: (device: Device) => boolean, patch: Partial<Device>) {
  const found = devices.find(predicate);
  if (found) Object.assign(found, patch);
}
patchDevice((d) => d.type === 'camera' && d.buildingId === 'B05', { status: 'warning' });
patchDevice((d) => d.type === 'charger' && d.key, { status: 'alarm' });
patchDevice((d) => d.type === 'lamp', { online: false, status: 'normal' });
patchDevice((d) => d.type === 'access' && d.buildingId === 'B09', { online: false, status: 'normal' });

function scatter(x: number, y: number, count: number, radius: number, seed: number): HeatPoint[] {
  const pts: HeatPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const ang = seed + i * 2.399;
    const r = radius * ((i % 6) + 1) / 7;
    const [lng, lat] = metersToLngLat(PARK_CENTER, x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    pts.push({ lng, lat, count: 18 + ((i * 13 + Math.round(seed * 8)) % 70) });
  }
  return pts;
}

export const heatPoints: HeatPoint[] = [
  ...scatter(0, -200, 14, 46, 0.4),
  ...scatter(230, 0, 10, 36, 1.2),
  ...scatter(-230, 0, 8, 32, 2.1),
  ...scatter(-120, 95, 12, 40, 0.8),
  ...scatter(168, 78, 10, 34, 1.7),
  ...scatter(-190, -140, 12, 38, 2.6),
  ...scatter(55, 20, 8, 30, 0.2),
];

export const presets = {
  global: { zoom: 16.62, pitch: 54, rotation: -28, target: PARK_CENTER },
  building: { zoom: 18.22, pitch: 63, rotation: 24, targetId: 'B01' },
  gate: { zoom: 18.5, pitch: 48, rotation: 4, targetId: 'G-S' },
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
