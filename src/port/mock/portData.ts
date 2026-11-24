import { metersToLngLat } from '../../utils/coord';
import type {
  BerthUnit,
  BlockDef,
  BoxStatus,
  BoxType,
  ContainerUnit,
  CraneUnit,
  FacilityUnit,
  LaneSeg,
  LngLat,
  MeterPoint,
  PresetName,
  TruckUnit,
  ViewTarget,
} from '../types/port';

/**
 * 澜港集装箱码头 mock。
 * 平面坐标是相对码头中心的米：x 东、y 北。真正进 Three 之前会先换成 GCJ-02，
 * 再交给高德 customCoords，避免把米直接当成世界坐标后和底图错开。
 * 锚点放在外高桥附近，用来和真实港区路网贴合，箱区本身是虚构的。
 */
export const PORT_NAME = '澜港集装箱码头';
export const PORT_CENTER: LngLat = [121.6582, 31.3506];

export const BOX_STATUS: Record<BoxStatus, { label: string; color: string }> = {
  empty: { label: '空箱', color: '#8aa4b8' },
  heavy: { label: '重箱', color: '#e07a3d' },
  pickup: { label: '待提箱', color: '#4aa3ff' },
  loadship: { label: '待装船', color: '#3dbe8c' },
};

export const ALARM_COLOR = {
  info: '#4aa3ff',
  warning: '#f0b429',
  urgent: '#ff5a62',
} as const;

export const HEAT_COLOR = ['#3dbe8c', '#f0b429', '#ff5a62'] as const;

const STATUS_CYCLE: BoxStatus[] = ['empty', 'heavy', 'pickup', 'loadship'];

export const blocks: BlockDef[] = [
  { id: 'A1', name: 'A1箱区', originX: -235, originY: 92, rows: 8, bays: 6, bayPitch: 14, rowPitch: 3, maxTier: 3 },
  { id: 'A2', name: 'A2箱区', originX: -105, originY: 92, rows: 8, bays: 6, bayPitch: 14, rowPitch: 3, maxTier: 3 },
  { id: 'B1', name: 'B1箱区', originX: 35, originY: 92, rows: 8, bays: 6, bayPitch: 14, rowPitch: 3, maxTier: 3 },
  { id: 'B2', name: 'B2箱区', originX: 165, originY: 92, rows: 8, bays: 6, bayPitch: 14, rowPitch: 3, maxTier: 4 },
];

export const berths: BerthUnit[] = [
  locateBerth({ id: 'BERTH-1', name: '1号泊位', ship: '澜港快航', east: -190, north: -28 }),
  locateBerth({ id: 'BERTH-2', name: '2号泊位', ship: '东方箱桥', east: 20, north: -28 }),
  locateBerth({ id: 'BERTH-3', name: '3号泊位', ship: '浦江穿梭', east: 200, north: -28 }),
];

export const cranes: CraneUnit[] = [
  locateCrane({ id: 'QC-01', name: '1号岸桥', berthId: 'BERTH-1', berthName: '1号泊位', homeEast: -190, homeNorth: 18 }),
  locateCrane({ id: 'QC-02', name: '2号岸桥', berthId: 'BERTH-2', berthName: '2号泊位', homeEast: -10, homeNorth: 18 }),
  locateCrane({ id: 'QC-03', name: '3号岸桥', berthId: 'BERTH-2', berthName: '2号泊位', homeEast: 70, homeNorth: 18 }),
  locateCrane({ id: 'QC-04', name: '4号岸桥', berthId: 'BERTH-3', berthName: '3号泊位', homeEast: 200, homeNorth: 18 }),
];

export const routes: Array<{ id: string; points: MeterPoint[] }> = [
  { id: 'R1', points: makeRoute(-200, -190, 'A1箱区') },
  { id: 'R2', points: makeRoute(-70, -10, 'A2箱区') },
  { id: 'R3', points: makeRoute(70, 70, 'B1箱区') },
  { id: 'R4', points: makeRoute(200, 200, 'B2箱区') },
];

export const lanes: LaneSeg[] = [
  { id: 'L-QUAY-W', name: '前沿车道西', ax: -240, ay: 40, bx: -80, by: 40 },
  { id: 'L-QUAY-C', name: '前沿车道中', ax: -80, ay: 40, bx: 80, by: 40 },
  { id: 'L-QUAY-E', name: '前沿车道东', ax: 80, ay: 40, bx: 240, by: 40 },
  { id: 'L-YARD-W', name: '堆场前沿路西', ax: -240, ay: 76, bx: 0, by: 76 },
  { id: 'L-YARD-E', name: '堆场前沿路东', ax: 0, ay: 76, bx: 240, by: 76 },
  { id: 'L-GATE-S', name: '进港通道', ax: 0, ay: 76, bx: 0, by: 180 },
  { id: 'L-GATE-N', name: '闸口排队区', ax: 0, ay: 180, bx: 0, by: 258 },
  { id: 'L-OUT', name: '离港通道', ax: 16, ay: 40, bx: 16, by: 258 },
];

export const facilities: FacilityUnit[] = [
  ...weighs(),
  ...cameras(),
  ...lamps(),
  locateFacility({ id: 'GATE-1', name: '北闸口', kind: 'gate', east: 0, north: 258, status: '开放', task: '进港验放', dest: '堆场' }),
];

export function blockCapacity(block: BlockDef) {
  return block.rows * block.bays * block.maxTier;
}

export function blockCenter(block: BlockDef) {
  return {
    east: block.originX + ((block.bays - 1) * block.bayPitch) / 2,
    north: block.originY + ((block.rows - 1) * block.rowPitch) / 2,
  };
}

/** 箱区按贝、排、层铺箱。B2 堆满，用来触发箱区超限。 */
export function buildContainers(): ContainerUnit[] {
  const list: ContainerUnit[] = [];
  blocks.forEach((block) => {
    for (let row = 0; row < block.rows; row += 1) {
      for (let bay = 0; bay < block.bays; bay += 1) {
        const tiers = block.id === 'B2' ? block.maxTier : 1 + ((row + bay * 2) % block.maxTier);
        for (let tier = 0; tier < tiers; tier += 1) {
          const boxType: BoxType = (bay + row) % 6 === 0 ? '20GP' : (tier === tiers - 1 && bay % 3 === 0 ? '40HC' : '40GP');
          const status = STATUS_CYCLE[(row + bay + tier) % STATUS_CYCLE.length] || 'heavy';
          const height = boxType === '40HC' ? 2.9 : 2.6;
          const x = block.originX + bay * block.bayPitch;
          const y = block.originY + row * block.rowPitch;
          const z = tier * 2.75 + height / 2;
          const [lng, lat] = metersToLngLat(PORT_CENTER, x, y);
          list.push({
            id: `${block.id}-R${row}-B${bay}-T${tier}`,
            boxType,
            status,
            blockId: block.id,
            blockName: block.name,
            x,
            y,
            z,
            wx: 0,
            wy: 0,
            wz: 0,
            lng,
            lat,
            hidden: false,
            reserved: false,
            instanceIndex: 0,
          });
        }
      }
    }
  });
  return list;
}

export function buildTrucks(): TruckUnit[] {
  const list: TruckUnit[] = [];
  routes.forEach((route, routeIndex) => {
    for (let i = 0; i < 6; i += 1) {
      const n = routeIndex * 6 + i + 1;
      const [lng, lat] = metersToLngLat(PORT_CENTER, 0, 200);
      list.push({
        id: `TK-${String(n).padStart(2, '0')}`,
        name: `集卡-${String(n).padStart(2, '0')}`,
        routeId: route.id,
        state: 'run',
        task: '沿路网行驶',
        dest: '堆场取箱',
        speed: 6.4 + (i % 4) * 0.7,
        east: 0,
        north: 200,
        lng,
        lat,
        heading: 0,
      });
    }
  });
  return list;
}

export function presetTarget(name: PresetName): ViewTarget {
  if (name === 'berth') {
    return { center: metersToLngLat(PORT_CENTER, 20, 8), zoom: 17.85, pitch: 64, rotation: -8 };
  }
  if (name === 'yard') {
    return { center: metersToLngLat(PORT_CENTER, -20, 110), zoom: 17.55, pitch: 58, rotation: 14 };
  }
  if (name === 'gate') {
    return { center: metersToLngLat(PORT_CENTER, 8, 230), zoom: 18.05, pitch: 52, rotation: 4 };
  }
  return { center: PORT_CENTER, zoom: 16.22, pitch: 55, rotation: -16 };
}

export function formatClock(time = Date.now()) {
  const date = new Date(time);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function makeRoute(yardX: number, craneX: number, yardName: string): MeterPoint[] {
  return [
    { x: -6, y: 262, label: '闸口进港' },
    { x: -6, y: 76, label: '进港通道' },
    { x: yardX, y: 76, stop: true, label: `堆场取箱 · ${yardName}` },
    { x: craneX, y: 40, stop: true, label: '岸桥下方交箱' },
    { x: 16, y: 40, label: '离泊通道' },
    { x: 16, y: 262, stop: true, label: '离港' },
  ];
}

function locateBerth(item: Omit<BerthUnit, 'lng' | 'lat'>): BerthUnit {
  const [lng, lat] = metersToLngLat(PORT_CENTER, item.east, item.north);
  return { ...item, lng, lat };
}

function locateCrane(item: Omit<CraneUnit, 'lng' | 'lat' | 'east' | 'north' | 'status' | 'task'>): CraneUnit {
  const [lng, lat] = metersToLngLat(PORT_CENTER, item.homeEast, item.homeNorth);
  return {
    ...item,
    east: item.homeEast,
    north: item.homeNorth,
    lng,
    lat,
    status: 'idle',
    task: '待机',
  };
}

function locateFacility(item: Omit<FacilityUnit, 'lng' | 'lat'>): FacilityUnit {
  const [lng, lat] = metersToLngLat(PORT_CENTER, item.east, item.north);
  return { ...item, lng, lat };
}

function weighs(): FacilityUnit[] {
  return [
    locateFacility({ id: 'WB-01', name: '1号地磅', kind: 'weigh', east: 0, north: 214, status: '正常', task: '空闲', dest: '闸口' }),
    locateFacility({ id: 'WB-02', name: '2号地磅', kind: 'weigh', east: 16, north: 214, status: '正常', task: '空闲', dest: '闸口' }),
  ];
}

function cameras(): FacilityUnit[] {
  const spots = [
    [-220, 48], [-80, 48], [40, 48], [180, 48], [-6, 180], [16, 240], [-200, 120], [200, 120],
  ];
  return spots.map((spot, index) => locateFacility({
    id: `CAM-${String(index + 1).padStart(2, '0')}`,
    name: `${index + 1}号监控`,
    kind: 'camera',
    east: spot[0] || 0,
    north: spot[1] || 0,
    status: '在线',
    task: '视频巡视',
    dest: '调度中心',
  }));
}

function lamps(): FacilityUnit[] {
  const list: FacilityUnit[] = [];
  for (let x = -220; x <= 220; x += 55) {
    list.push(locateFacility({
      id: `LAMP-Q-${x}`,
      name: '前沿路灯',
      kind: 'lamp',
      east: x,
      north: 52,
      status: '正常',
      task: '照明',
      dest: '前沿',
    }));
  }
  for (let y = 100; y <= 240; y += 46) {
    list.push(locateFacility({
      id: `LAMP-G-${y}`,
      name: '闸口路灯',
      kind: 'lamp',
      east: -18,
      north: y,
      status: '正常',
      task: '照明',
      dest: '闸口',
    }));
  }
  return list;
}
