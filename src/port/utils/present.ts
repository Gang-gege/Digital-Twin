import { ALARM_COLOR, BOX_STATUS } from '../mock/portData';
import type {
  AlarmLevel,
  ContainerUnit,
  CraneUnit,
  FacilityUnit,
  SelectionPayload,
  TruckUnit,
} from '../types/port';

const LEVEL: Record<string, AlarmLevel | 'normal'> = {
  idle: 'normal',
  working: 'info',
  fault: 'urgent',
  run: 'normal',
  dwell: 'warning',
  stop: 'info',
};

export function presentCrane(crane: CraneUnit): SelectionPayload {
  return {
    kind: 'crane',
    id: crane.id,
    title: crane.name,
    subtitle: crane.berthName,
    badge: crane.status === 'fault' ? '故障' : crane.status === 'working' ? '作业中' : '待机',
    level: LEVEL[crane.status] || 'normal',
    lng: crane.lng,
    lat: crane.lat,
    rows: [
      { label: '编号', value: crane.id },
      { label: '状态', value: crane.status === 'fault' ? '故障' : crane.status === 'working' ? '作业中' : '待机' },
      { label: '作业任务', value: crane.task },
      { label: '停靠泊位', value: crane.berthName },
      { label: '目的地', value: '船舶舱位' },
    ],
  };
}

export function presentTruck(truck: TruckUnit): SelectionPayload {
  const state = truck.state === 'run' ? '行驶' : truck.state === 'dwell' ? '作业停车' : '到达停车';
  return {
    kind: 'truck',
    id: truck.id,
    title: truck.name,
    subtitle: truck.routeId,
    badge: state,
    level: LEVEL[truck.state] || 'normal',
    lng: truck.lng,
    lat: truck.lat,
    rows: [
      { label: '编号', value: truck.id },
      { label: '状态', value: state },
      { label: '作业任务', value: truck.task },
      { label: '停靠泊位', value: '—' },
      { label: '目的地', value: truck.dest },
    ],
  };
}

export function presentContainer(box: ContainerUnit): SelectionPayload {
  const meta = BOX_STATUS[box.status];
  return {
    kind: 'container',
    id: box.id,
    title: box.id,
    subtitle: `${box.boxType} · ${box.blockName}`,
    badge: meta.label,
    level: 'normal',
    lng: box.lng,
    lat: box.lat,
    rows: [
      { label: '编号', value: box.id },
      { label: '状态', value: meta.label },
      { label: '作业任务', value: box.reserved ? '已派装船' : '在场堆存' },
      { label: '停靠泊位', value: '—' },
      { label: '目的地', value: box.status === 'loadship' || box.status === 'heavy' ? '待装船舶' : box.blockName },
    ],
  };
}

export function presentFacility(unit: FacilityUnit): SelectionPayload {
  return {
    kind: unit.kind === 'weigh' ? 'weigh' : unit.kind === 'gate' ? 'gate' : 'camera',
    id: unit.id,
    title: unit.name,
    subtitle: unit.kind === 'weigh' ? '地磅' : unit.kind === 'gate' ? '闸口' : '监控',
    badge: unit.status,
    level: 'normal',
    lng: unit.lng,
    lat: unit.lat,
    rows: [
      { label: '编号', value: unit.id },
      { label: '状态', value: unit.status },
      { label: '作业任务', value: unit.task },
      { label: '停靠泊位', value: '—' },
      { label: '目的地', value: unit.dest },
    ],
  };
}

export function presentMulti(list: ContainerUnit[]): SelectionPayload {
  return {
    kind: 'multi',
    id: null,
    title: `框选箱区 ${list.length} 箱`,
    subtitle: '批量查看',
    badge: `${list.length}`,
    level: 'selected',
    rows: [
      { label: '编号', value: '多选' },
      { label: '状态', value: '见列表' },
      { label: '作业任务', value: '箱区盘点' },
      { label: '停靠泊位', value: '—' },
      { label: '目的地', value: list[0]?.blockName || '堆场' },
    ],
    items: list.slice(0, 14).map((box) => ({
      id: box.id,
      name: `${box.id} ${BOX_STATUS[box.status].label}`,
      status: box.status,
    })),
  };
}

export function alarmTint(level: AlarmLevel) {
  return ALARM_COLOR[level];
}
