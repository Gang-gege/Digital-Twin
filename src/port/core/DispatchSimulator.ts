import { BOX_STATUS, formatClock } from '../mock/portData';
import type { ContainerUnit, CraneUnit, JobLog, WorkTask } from '../types/port';
import type { CraneAnimator } from './CraneAnimator';

/**
 * 前端定时调度。没有后端，用仿真时钟给空闲岸桥派装船指令，并写作业日志。
 */
export class DispatchSimulator {
  declare containers: ContainerUnit[];
  declare cranes: CraneUnit[];
  declare animator: CraneAnimator;
  declare queue: WorkTask[];
  declare active: WorkTask[];
  declare logs: JobLog[];
  declare cursor: number;
  declare offset: number;
  declare onChange: (() => void) | null;

  constructor(containers: ContainerUnit[], cranes: CraneUnit[], animator: CraneAnimator) {
    this.containers = containers;
    this.cranes = cranes;
    this.animator = animator;
    this.queue = [];
    this.active = [];
    this.logs = [];
    this.cursor = 0;
    this.offset = 0;
    this.onChange = null;
    animator.onGrab = (containerId) => {
      const box = this.containers.find((item) => item.id === containerId);
      if (!box) return;
      box.hidden = true;
      this.onChange?.();
    };
    animator.onDrop = (containerId, craneId) => this.finish(containerId, craneId);
    this.fillQueue();
  }

  update(dt: number) {
    if (dt <= 0) return;
    this.cranes.forEach((crane) => {
      if (crane.status === 'fault' || this.animator.isBusy(crane.id)) return;
      const task = this.queue.find((item) => item.craneId === crane.id) || this.queue[0];
      if (!task) return;
      const box = this.containers.find((item) => item.id === task.containerId && !item.hidden);
      if (!box) {
        this.queue = this.queue.filter((item) => item !== task);
        return;
      }
      const started = this.animator.start(crane.id, {
        containerId: box.id,
        color: BOX_STATUS[box.status].color,
        scaleX: box.boxType === '20GP' ? 0.5 : 1,
        offset: ((this.offset % 5) - 2) * 6,
      });
      if (!started) return;
      this.offset += 1;
      this.queue = this.queue.filter((item) => item !== task);
      task.state = '进行中';
      this.active.push(task);
    });
    this.fillQueue();
  }

  tasks() {
    return [...this.active, ...this.queue];
  }

  reset() {
    this.queue = [];
    this.active = [];
    this.logs = [];
    this.cursor = 0;
    this.containers.forEach((box) => {
      box.hidden = false;
      box.reserved = false;
    });
    this.fillQueue();
    this.onChange?.();
  }

  fillQueue() {
    let guard = 0;
    while (this.queue.length < 4 && guard < 40) {
      guard += 1;
      const box = this.nextBox();
      if (!box) break;
      const crane = this.cranes[this.cursor % this.cranes.length];
      this.cursor += 1;
      if (!crane) break;
      box.reserved = true;
      this.queue.push({
        id: `TASK-${box.id}`,
        title: `${crane.name} 装船`,
        detail: `${box.id} · ${box.blockName} · ${BOX_STATUS[box.status].label}`,
        state: '待作业',
        craneId: crane.id,
        containerId: box.id,
      });
    }
  }

  nextBox() {
    const total = this.containers.length;
    for (let i = 0; i < total; i += 1) {
      const box = this.containers[(this.cursor + i) % total];
      if (!box || box.hidden || box.reserved) continue;
      if (box.status === 'loadship' || box.status === 'heavy') return box;
    }
    return undefined;
  }

  finish(containerId: string, craneId: string) {
    const box = this.containers.find((item) => item.id === containerId);
    const crane = this.cranes.find((item) => item.id === craneId);
    if (box) box.reserved = false;
    this.active = this.active.filter((item) => item.containerId !== containerId);
    const now = Date.now();
    this.logs.unshift({
      id: `LOG-${now}`,
      time: now,
      timeText: formatClock(now),
      craneId,
      containerId,
      text: `${crane?.name || craneId} 完成 ${containerId} 装船`,
    });
    this.logs = this.logs.slice(0, 30);
  }
}
