import { formatClock } from '../mock/portData';
import type { AlarmRecord, BlockStat, CraneUnit } from '../types/port';

export interface AlarmSample {
  fault: boolean;
  gateQueue: number;
  blocks: BlockStat[];
  lanes: Array<{ id: string; name: string; east: number; north: number; count: number }>;
  cranes: CraneUnit[];
}

/** 岸桥故障、车道拥堵、箱区超限、闸口排队。等级分提示、预警、紧急。 */
export class AlarmManager {
  declare records: AlarmRecord[];
  declare clock: number;
  declare since: number;

  constructor() {
    this.records = [];
    this.clock = 0;
    this.since = 0;
  }

  /** 返回这一拍要不要把 3 号岸桥标成故障。仿真暂停时时钟不走。 */
  update(dt: number, sample: AlarmSample) {
    this.clock += dt;
    const fault = this.clock % 26 > 18;
    this.since += dt;
    if (this.records.length && this.since < 1.2) return fault;
    this.since = 0;
    const now = Date.now();
    const next: AlarmRecord[] = [];
    if (fault) {
      const crane = sample.cranes.find((item) => item.id === 'QC-03');
      next.push({
        id: 'ALM-CRANE',
        level: 'urgent',
        kind: 'crane',
        title: '岸桥故障',
        message: '3号岸桥起升机构故障',
        targetId: 'QC-03',
        east: crane?.east ?? 70,
        north: crane?.north ?? 18,
        time: now,
        timeText: formatClock(now),
      });
    }
    const hot = [...sample.lanes].sort((a, b) => b.count - a.count)[0];
    if (hot && hot.count >= 3) {
      next.push({
        id: `ALM-${hot.id}`,
        level: hot.count >= 5 ? 'urgent' : 'warning',
        kind: 'congestion',
        title: '集卡拥堵',
        message: `${hot.name} ${hot.count} 辆，${hot.count >= 5 ? '拥堵' : '缓行'}`,
        targetId: hot.id,
        east: hot.east,
        north: hot.north,
        time: now,
        timeText: formatClock(now),
      });
    }
    sample.blocks.filter((block) => block.rate >= 0.9).forEach((block) => {
      next.push({
        id: `ALM-${block.id}`,
        level: 'warning',
        kind: 'yard',
        title: '箱区超限',
        message: `${block.name} ${block.count}/${block.capacity}`,
        targetId: block.id,
        east: block.east,
        north: block.north,
        time: now,
        timeText: formatClock(now),
      });
    });
    if (sample.gateQueue >= 2) {
      next.push({
        id: 'ALM-GATE',
        level: 'info',
        kind: 'gate',
        title: '闸口排队',
        message: `北闸口停车 ${sample.gateQueue} 辆`,
        targetId: 'GATE-1',
        east: 0,
        north: 240,
        time: now,
        timeText: formatClock(now),
      });
    }
    this.records = next;
    return fault;
  }

  reset() {
    this.records = [];
    this.clock = 0;
    this.since = 0;
  }
}
