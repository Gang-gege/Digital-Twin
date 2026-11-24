import * as THREE from 'three';
import { metersToLngLat } from '../../utils/coord';
import { PORT_CENTER, routes } from '../mock/portData';
import type { LaneSeg, MeterPoint, TruckUnit } from '../types/port';

interface CompiledPath {
  points: MeterPoint[];
  cum: number[];
  length: number;
}

interface RuntimeTruck {
  unit: TruckUnit;
  path: CompiledPath;
  progress: number;
  stopAt: number;
  stopLabel: string;
  dwell: number;
  idle: number;
  history: Array<{ x: number; y: number; z: number }>;
}

/**
 * 集卡沿闸口 → 堆场 → 岸桥 → 离港行驶。
 * 到停车点会停下作业，到离港终点保持停车，停留后再派下一圈。
 */
export class TruckSimulator {
  declare units: RuntimeTruck[];
  declare mesh: THREE.InstancedMesh;
  declare dummy: THREE.Object3D;
  declare toWorld: (east: number, north: number, z: number) => THREE.Vector3;
  declare selected: Set<string>;

  constructor(
    trucks: TruckUnit[],
    mesh: THREE.InstancedMesh,
    toWorld: (east: number, north: number, z: number) => THREE.Vector3,
  ) {
    this.mesh = mesh;
    this.toWorld = toWorld;
    this.dummy = new THREE.Object3D();
    this.selected = new Set();
    const compiled = new Map(routes.map((route) => [route.id, compilePath(route.points)]));
    this.units = trucks.map((unit, index) => {
      const path = compiled.get(unit.routeId) || compilePath([]);
      const fraction = [0.08, 0.22, 0.37, 0.51, 0.66, 0.8][index % 6] || 0.1;
      const progress = path.length * fraction;
      const stop = nextStop(path, progress);
      return {
        unit,
        path,
        progress,
        stopAt: stop.dist,
        stopLabel: stop.label,
        dwell: 0,
        idle: 0,
        history: [],
      };
    });
    this.sync(0);
  }

  update(dt: number) {
    this.units.forEach((runtime) => {
      if (dt > 0) this.advance(runtime, dt);
    });
    this.sync(dt);
  }

  reset() {
    this.units.forEach((runtime, index) => {
      const fraction = [0.08, 0.22, 0.37, 0.51, 0.66, 0.8][index % 6] || 0.1;
      runtime.progress = runtime.path.length * fraction;
      runtime.unit.state = 'run';
      runtime.unit.task = '沿路网行驶';
      const stop = nextStop(runtime.path, runtime.progress);
      runtime.stopAt = stop.dist;
      runtime.stopLabel = stop.label;
      runtime.unit.dest = stop.label;
      runtime.dwell = 0;
      runtime.idle = 0;
      runtime.history = [];
    });
    this.sync(0);
  }

  heat(lanes: LaneSeg[]) {
    return lanes.map((lane) => {
      let count = 0;
      this.units.forEach((runtime) => {
        if (distanceToSeg(runtime.unit.east, runtime.unit.north, lane) < 18) count += 1;
      });
      const east = (lane.ax + lane.bx) / 2;
      const north = (lane.ay + lane.by) / 2;
      return { ...lane, east, north, count };
    });
  }

  gateQueue() {
    return this.units.filter((runtime) => runtime.unit.north > 200 && runtime.unit.state !== 'run').length;
  }

  advance(runtime: RuntimeTruck, dt: number) {
    const { unit } = runtime;
    if (unit.state === 'stop') {
      runtime.idle += dt;
      unit.task = '已到达，等待下一指令';
      unit.dest = '离港';
      if (runtime.idle > 6) this.relaunch(runtime);
      return;
    }
    if (unit.state === 'dwell') {
      runtime.dwell -= dt;
      unit.task = runtime.stopLabel;
      unit.dest = runtime.stopLabel;
      if (runtime.dwell > 0) return;
      if (runtime.progress >= runtime.path.length - 0.6) {
        unit.state = 'stop';
        unit.task = '已到达，等待下一指令';
        unit.dest = '离港';
        runtime.idle = 0;
        return;
      }
      unit.state = 'run';
      const stop = nextStop(runtime.path, runtime.progress);
      runtime.stopAt = stop.dist;
      runtime.stopLabel = stop.label;
      unit.dest = stop.label;
      unit.task = '沿路网行驶';
      return;
    }
    runtime.progress += unit.speed * dt;
    if (runtime.progress < runtime.stopAt) return;
    runtime.progress = runtime.stopAt;
    unit.state = 'dwell';
    runtime.dwell = 2.6;
    unit.task = runtime.stopLabel;
    unit.dest = runtime.stopLabel;
  }

  relaunch(runtime: RuntimeTruck) {
    runtime.progress = 0;
    runtime.idle = 0;
    runtime.dwell = 0;
    runtime.unit.state = 'run';
    const stop = nextStop(runtime.path, 0);
    runtime.stopAt = stop.dist;
    runtime.stopLabel = stop.label;
    runtime.unit.task = '沿路网行驶';
    runtime.unit.dest = stop.label;
    runtime.history = [];
  }

  sync(dt: number) {
    this.units.forEach((runtime, index) => {
      const sample = samplePath(runtime.path, runtime.progress);
      const world = this.toWorld(sample.x, sample.y, 0);
      const [lng, lat] = metersToLngLat(PORT_CENTER, sample.x, sample.y);
      runtime.unit.east = sample.x;
      runtime.unit.north = sample.y;
      runtime.unit.lng = lng;
      runtime.unit.lat = lat;
      if (Math.hypot(sample.dx, sample.dy) > 0.2) {
        runtime.unit.heading = -Math.atan2(sample.dx, sample.dy);
      }
      const last = runtime.history[runtime.history.length - 1];
      if (!last || Math.hypot(last.x - world.x, last.y - world.y) > 4) {
        runtime.history.push({ x: world.x, y: world.y, z: 1.5 });
        if (runtime.history.length > 16) runtime.history.shift();
      }
      const selected = this.selected.has(runtime.unit.id);
      this.dummy.position.set(world.x, world.y, 0);
      this.dummy.rotation.set(0, 0, runtime.unit.heading);
      this.dummy.scale.setScalar(selected ? 1.25 : 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      this.mesh.setColorAt(index, new THREE.Color(selected ? '#7dd3fc' : '#f4c430'));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    void dt;
  }
}

export function compilePath(points: MeterPoint[]): CompiledPath {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    cum.push((cum[i - 1] || 0) + Math.hypot(curr.x - prev.x, curr.y - prev.y));
  }
  return { points, cum, length: cum[cum.length - 1] || 0 };
}

function samplePath(path: CompiledPath, dist: number) {
  const d = Math.max(0, Math.min(path.length, dist));
  let index = 1;
  while (index < path.cum.length - 1 && (path.cum[index] || 0) < d) index += 1;
  const prev = path.points[index - 1] || path.points[0] || { x: 0, y: 0 };
  const next = path.points[index] || prev;
  const start = path.cum[index - 1] || 0;
  const end = path.cum[index] || start;
  const span = end - start;
  const t = span <= 0.001 ? 0 : (d - start) / span;
  return {
    x: prev.x + (next.x - prev.x) * t,
    y: prev.y + (next.y - prev.y) * t,
    dx: next.x - prev.x,
    dy: next.y - prev.y,
  };
}

function nextStop(path: CompiledPath, after: number) {
  for (let i = 1; i < path.points.length; i += 1) {
    const point = path.points[i];
    const dist = path.cum[i] || 0;
    if (point?.stop && dist > after + 0.4) return { dist, label: point.label || '停车' };
  }
  const last = path.points[path.points.length - 1];
  return { dist: path.length, label: last?.label || '离港' };
}

function distanceToSeg(px: number, py: number, lane: LaneSeg) {
  const dx = lane.bx - lane.ax;
  const dy = lane.by - lane.ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - lane.ax) * dx + (py - lane.ay) * dy) / len2));
  return Math.hypot(px - (lane.ax + dx * t), py - (lane.ay + dy * t));
}
