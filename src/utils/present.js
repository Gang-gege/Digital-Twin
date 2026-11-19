import { DEVICE_TYPES } from '../mock/parkData.js';

export const STATUS_HEX = {
  normal: '#2fce8a',
  warning: '#f5c451',
  alarm: '#ff5b6a',
  offline: '#64748b',
  selected: '#38bdf8',
};

export function statusKey(device) {
  if (!device.online) return 'offline';
  return device.status || 'normal';
}

export function statusLabel(device) {
  const map = { normal: '正常', warning: '预警', alarm: '告警', offline: '离线' };
  return map[statusKey(device)];
}

function coordRows(lng, lat, east, north) {
  return [
    { label: '经度', value: lng.toFixed(6) },
    { label: '纬度', value: lat.toFixed(6) },
    { label: '东向', value: `${east.toFixed(1)} m` },
    { label: '北向', value: `${north.toFixed(1)} m` },
  ];
}

function clock(ts) {
  const date = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

/** 把拾取结果整理成信息面板可以直接渲染的结构。 */
export function presentBuilding(building) {
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
      { label: '层高', value: '3.2 m' },
      { label: '建筑高度', value: `${building.height.toFixed(1)} m` },
      { label: '分区', value: building.zone },
      ...coordRows(building.lng, building.lat, building.x, building.y),
    ],
  };
}

export function presentDevice(device) {
  const meta = DEVICE_TYPES[device.type];
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
      { label: '安装高度', value: `${device.elev.toFixed(1)} m` },
      { label: meta.metric, value: `${Number(device.telemetry.value).toFixed(1)} ${meta.unit}` },
      { label: '温度', value: `${device.telemetry.temperature.toFixed(1)} ℃` },
      { label: '数据时间', value: clock(device.telemetry.updatedAt) },
      ...coordRows(device.lng, device.lat, device.x, device.y),
    ],
  };
}

export function presentPipe(pipe) {
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

export function presentGate(gate) {
  return {
    kind: 'gate',
    id: gate.id,
    title: gate.name,
    subtitle: '园区出入口',
    badge: '出入口',
    level: 'normal',
    rows: [
      { label: '编号', value: gate.id },
      { label: '类型', value: '车行出入口' },
      ...coordRows(gate.lng, gate.lat, gate.x, gate.y),
    ],
  };
}

export function presentMulti(devices) {
  const counter = {};
  devices.forEach((device) => {
    counter[device.type] = (counter[device.type] || 0) + 1;
  });
  return {
    kind: 'multi',
    id: null,
    title: `已框选 ${devices.length} 个设备`,
    subtitle: '点击条目飞到该设备',
    badge: '批量',
    level: 'selected',
    rows: Object.entries(counter).map(([type, count]) => ({
      label: DEVICE_TYPES[type].label,
      value: `${count} 个`,
    })),
    items: devices.map((device) => ({
      id: device.id,
      name: device.name,
      status: statusLabel(device),
      level: statusKey(device),
    })),
    ids: devices.map((device) => device.id),
  };
}
