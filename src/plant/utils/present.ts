import { DEVICE_TYPES } from '../mock/parkData';
import type { Building, Device, DeviceType, Gate, Pipe, SelectionPayload, StatusKey } from '../types/park';

export const STATUS_HEX: Record<StatusKey, string> = {
  normal: '#3dbe8c',
  info: '#4aa3ff',
  warning: '#f0b429',
  urgent: '#ff5a62',
  offline: '#64748b',
  selected: '#7dd3fc',
};

const STATUS_LABEL: Record<StatusKey, string> = {
  normal: '正常',
  info: '提示',
  warning: '预警',
  urgent: '紧急',
  offline: '离线',
  selected: '选中',
};

export function statusKey(device: Device): StatusKey {
  if (!device.online) return 'offline';
  return device.status || 'normal';
}

export function statusLabel(device: Device) {
  return STATUS_LABEL[statusKey(device)];
}

function coordRows(lng: number, lat: number, east: number, north: number) {
  return [
    { label: '经度', value: lng.toFixed(6) },
    { label: '纬度', value: lat.toFixed(6) },
    { label: '东向', value: `${east.toFixed(1)} m` },
    { label: '北向', value: `${north.toFixed(1)} m` },
  ];
}

function clock(ts: number) {
  const date = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export function presentBuilding(building: Building): SelectionPayload {
  return {
    kind: 'building',
    id: building.id,
    title: building.name,
    subtitle: '建筑白模',
    badge: building.usage,
    level: 'normal',
    rows: [
      { label: '编号', value: building.id },
      { label: '用途', value: building.usage },
      { label: '楼层', value: `${building.floors} 层` },
      { label: '占地', value: `${Math.round(building.w * building.d)} ㎡` },
      { label: '建筑高度', value: `${building.height.toFixed(1)} m` },
      { label: '分区', value: building.zone },
      ...coordRows(building.lng, building.lat, building.x, building.y),
    ],
  };
}

export function presentDevice(device: Device): SelectionPayload {
  const meta = DEVICE_TYPES[device.type];
  const tel = device.telemetry;
  return {
    kind: 'device',
    id: device.id,
    title: device.name,
    subtitle: meta.label,
    badge: statusLabel(device),
    level: statusKey(device),
    lng: device.lng,
    lat: device.lat,
    rows: [
      { label: '编号', value: device.id },
      { label: '类型', value: meta.label },
      { label: '分区', value: device.zone },
      { label: '在线状态', value: device.online ? '在线' : '离线' },
      { label: '运行状态', value: statusLabel(device) },
      { label: '温度', value: `${tel.temperature.toFixed(1)} ℃` },
      { label: '压力', value: `${tel.pressure.toFixed(2)} MPa` },
      { label: '湿度', value: `${tel.humidity.toFixed(0)} %` },
      { label: '数据时间', value: clock(tel.updatedAt) },
      ...coordRows(device.lng, device.lat, device.x, device.y),
    ],
  };
}

export function presentPipe(pipe: Pipe): SelectionPayload {
  return {
    kind: 'pipe',
    id: pipe.id,
    title: pipe.name,
    subtitle: '地下管网',
    badge: pipe.medium,
    level: 'normal',
    rows: [
      { label: '编号', value: pipe.id },
      { label: '介质', value: pipe.medium },
      { label: '规格', value: pipe.spec },
      { label: '管径', value: pipe.diameter },
      { label: '埋深', value: `${Math.abs(pipe.depth).toFixed(1)} m` },
      { label: '长度', value: `${pipe.length.toFixed(1)} m` },
      { label: '压力/负荷', value: pipe.load },
      ...coordRows(pipe.lng, pipe.lat, pipe.mid[0], pipe.mid[1]),
    ],
  };
}

export function presentGate(gate: Gate): SelectionPayload {
  return {
    kind: 'gate',
    id: gate.id,
    title: gate.name,
    subtitle: '厂区出入口',
    badge: '出入口',
    level: 'normal',
    rows: [
      { label: '编号', value: gate.id },
      { label: '类型', value: '车行出入口' },
      ...coordRows(gate.lng, gate.lat, gate.x, gate.y),
    ],
  };
}

export function presentMulti(list: Device[]): SelectionPayload {
  const counter: Partial<Record<DeviceType, number>> = {};
  list.forEach((device) => {
    counter[device.type] = (counter[device.type] || 0) + 1;
  });
  return {
    kind: 'multi',
    id: null,
    title: `已框选 ${list.length} 个设备`,
    subtitle: '点击条目飞到该设备',
    badge: '批量',
    level: 'selected',
    rows: Object.entries(counter).map(([type, count]) => ({
      label: DEVICE_TYPES[type as DeviceType].label,
      value: `${count} 个`,
    })),
    items: list.map((device) => ({
      id: device.id,
      name: device.name,
      status: statusLabel(device),
      level: statusKey(device),
    })),
    ids: list.map((device) => device.id),
  };
}
