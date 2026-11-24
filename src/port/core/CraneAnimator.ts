import * as THREE from 'three';
import type { CraneUnit } from '../types/port';
import type { CraneParts } from '../utils/render';

type Phase = 'gantry' | 'trolley' | 'lower' | 'lock' | 'raise' | 'trolley2' | 'lower2' | 'unlock' | 'raise2';

interface ActiveJob {
  containerId: string;
  phase: Phase;
  gantryTarget: number;
  color: string;
  scaleX: number;
  hold: number;
}

export interface CraneRig extends CraneParts {
  id: string;
  unit: CraneUnit;
  anchor: THREE.Vector3;
  gantry: number;
  fault: boolean;
  job: ActiveJob | null;
}

/**
 * 岸桥动画：大车行走、吊具横移、起升下降、闭锁后集装箱挂在吊具上一起动。
 * 装船只在岸桥跨距内完成，堆场里的箱子在闭锁时隐藏，表示已经被吊走。
 */
export class CraneAnimator {
  declare rigs: CraneRig[];
  declare onGrab: ((containerId: string) => void) | null;
  declare onDrop: ((containerId: string, craneId: string) => void) | null;

  constructor() {
    this.rigs = [];
    this.onGrab = null;
    this.onDrop = null;
  }

  add(rig: CraneRig) {
    this.rigs.push(rig);
    this.syncPose(rig);
  }

  isBusy(id: string) {
    return Boolean(this.rigs.find((rig) => rig.id === id)?.job);
  }

  setFault(id: string, fault: boolean) {
    const rig = this.rigs.find((item) => item.id === id);
    if (!rig) return;
    rig.fault = fault;
    if (fault) {
      rig.unit.status = 'fault';
      rig.unit.task = '故障停机';
    }
  }

  start(craneId: string, visual: { containerId: string; color: string; scaleX: number; offset: number }) {
    const rig = this.rigs.find((item) => item.id === craneId);
    if (!rig || rig.job || rig.fault) return false;
    rig.job = {
      containerId: visual.containerId,
      phase: 'gantry',
      gantryTarget: visual.offset,
      color: visual.color,
      scaleX: visual.scaleX,
      hold: 0,
    };
    rig.unit.status = 'working';
    rig.unit.task = '接受装船指令';
    return true;
  }

  update(dt: number) {
    this.rigs.forEach((rig) => {
      if (rig.fault) {
        rig.unit.status = 'fault';
        rig.unit.task = '故障停机';
        this.syncPose(rig);
        return;
      }
      if (!rig.job) {
        rig.unit.status = 'idle';
        rig.unit.task = '待机';
        this.syncPose(rig);
        return;
      }
      rig.unit.status = 'working';
      this.step(rig, rig.job, dt);
      this.syncPose(rig);
    });
  }

  reset() {
    this.rigs.forEach((rig) => {
      rig.job = null;
      rig.fault = false;
      rig.box.visible = false;
      rig.gantry = 0;
      rig.trolley.position.y = 8;
      rig.spreader.position.z = -8;
      rig.unit.status = 'idle';
      rig.unit.task = '待机';
      this.syncPose(rig);
    });
  }

  step(rig: CraneRig, job: ActiveJob, dt: number) {
    if (job.phase === 'gantry') {
      const moved = move(rig.gantry, job.gantryTarget, 12, dt);
      rig.gantry = moved.value;
      rig.unit.task = '大车行走';
      if (moved.done) job.phase = 'trolley';
      return;
    }
    if (job.phase === 'trolley') {
      const moved = move(rig.trolley.position.y, 18, 14, dt);
      rig.trolley.position.y = moved.value;
      rig.unit.task = '吊具移向集卡';
      if (moved.done) job.phase = 'lower';
      return;
    }
    if (job.phase === 'lower') {
      const moved = move(rig.spreader.position.z, -28, 10, dt);
      rig.spreader.position.z = moved.value;
      rig.unit.task = '吊具下降';
      if (moved.done) job.phase = 'lock';
      return;
    }
    if (job.phase === 'lock') {
      job.hold += dt;
      rig.unit.task = '吊具闭锁';
      if (job.hold < 0.35) return;
      rig.box.visible = true;
      rig.box.scale.x = job.scaleX;
      rig.boxMat.color.set(job.color);
      this.onGrab?.(job.containerId);
      job.hold = 0;
      job.phase = 'raise';
      return;
    }
    if (job.phase === 'raise') {
      const moved = move(rig.spreader.position.z, -6, 8, dt);
      rig.spreader.position.z = moved.value;
      rig.unit.task = '起升吊箱';
      if (moved.done) job.phase = 'trolley2';
      return;
    }
    if (job.phase === 'trolley2') {
      const moved = move(rig.trolley.position.y, -30, 12, dt);
      rig.trolley.position.y = moved.value;
      rig.unit.task = '吊箱移向船舶';
      if (moved.done) job.phase = 'lower2';
      return;
    }
    if (job.phase === 'lower2') {
      const moved = move(rig.spreader.position.z, -22, 8, dt);
      rig.spreader.position.z = moved.value;
      rig.unit.task = '下降放箱';
      if (moved.done) job.phase = 'unlock';
      return;
    }
    if (job.phase === 'unlock') {
      job.hold += dt;
      rig.unit.task = '开锁落箱';
      if (job.hold < 0.3) return;
      rig.box.visible = false;
      this.onDrop?.(job.containerId, rig.id);
      job.hold = 0;
      job.phase = 'raise2';
      return;
    }
    const moved = move(rig.spreader.position.z, -8, 8, dt);
    rig.spreader.position.z = moved.value;
    rig.unit.task = '吊具回升';
    if (moved.done) rig.job = null;
  }

  syncPose(rig: CraneRig) {
    rig.group.position.set(rig.anchor.x + rig.gantry, rig.anchor.y, rig.anchor.z);
    rig.unit.east = rig.unit.homeEast + rig.gantry;
    rig.unit.north = rig.unit.homeNorth;
  }
}

function move(current: number, target: number, speed: number, dt: number) {
  const delta = target - current;
  const max = speed * dt;
  if (Math.abs(delta) <= max) return { value: target, done: true };
  return { value: current + Math.sign(delta) * max, done: false };
}
