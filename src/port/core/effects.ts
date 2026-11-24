import * as THREE from 'three';
import { HEAT_COLOR, lanes } from '../mock/portData';
import { createTrailMaterial } from '../shaders/materials';
import type { LaneSeg } from '../types/port';

const CURVE = 20;
const TRAIL = 16;

export interface FlowChain {
  ship: THREE.Vector3;
  crane: THREE.Vector3;
  box: THREE.Vector3;
  truck: THREE.Vector3;
}

interface TrailLine {
  line: THREE.Line;
  position: THREE.BufferAttribute;
  fade: THREE.BufferAttribute;
}

/**
 * 作业飞线、集卡轨迹和车道拥堵色带。
 * 飞线用虚线偏移做出流动；轨迹用顶点透明度做出渐隐。
 */
export class EffectLayer {
  declare flowGroup: THREE.Group;
  declare trailGroup: THREE.Group;
  declare heatMeshes: THREE.Mesh[];
  declare flowLines: THREE.Line[];
  declare flowMats: THREE.LineDashedMaterial[];
  declare trails: TrailLine[];
  declare trailMat: THREE.ShaderMaterial;

  constructor(flowGroup: THREE.Group, trailGroup: THREE.Group, roadGroup: THREE.Group, at: At) {
    this.flowGroup = flowGroup;
    this.trailGroup = trailGroup;
    this.flowLines = [];
    this.flowMats = [];
    this.trails = [];
    this.heatMeshes = [];
    this.trailMat = createTrailMaterial();
    for (let i = 0; i < 6; i += 1) {
      const geometry = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(new Float32Array((CURVE + 1) * 3), 3);
      geometry.setAttribute('position', position);
      const material = new THREE.LineDashedMaterial({
        color: i % 3 === 0 ? 0x38bdf8 : i % 3 === 1 ? 0xf0b429 : 0x3dbe8c,
        dashSize: 3.5,
        gapSize: 1.8,
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      line.frustumCulled = false;
      flowGroup.add(line);
      this.flowLines.push(line);
      this.flowMats.push(material);
    }
    lanes.forEach((lane) => {
      const mesh = heatMesh(lane, at);
      roadGroup.add(mesh);
      this.heatMeshes.push(mesh);
    });
  }

  ensureTrails(count: number) {
    while (this.trails.length < count) {
      const geometry = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3);
      const fade = new THREE.BufferAttribute(new Float32Array(TRAIL), 1);
      geometry.setAttribute('position', position);
      geometry.setAttribute('aFade', fade);
      const line = new THREE.Line(geometry, this.trailMat);
      line.frustumCulled = false;
      this.trailGroup.add(line);
      this.trails.push({ line, position, fade });
    }
  }

  update(time: number, chains: FlowChain[], trails: Array<Array<{ x: number; y: number; z: number }>>, heat: number[]) {
    this.flowMats.forEach((material) => {
      const dashed = material as THREE.LineDashedMaterial & { dashOffset: number };
      dashed.dashOffset = -time * 14;
    });
    chains.forEach((chain, index) => {
      writeCurve(this.flowLines[index * 3], chain.ship, chain.crane, 18);
      writeCurve(this.flowLines[index * 3 + 1], chain.crane, chain.box, 22);
      writeCurve(this.flowLines[index * 3 + 2], chain.box, chain.truck, 12);
    });
    this.ensureTrails(trails.length);
    trails.forEach((history, index) => {
      const trail = this.trails[index];
      if (!trail) return;
      const last = history[history.length - 1] || { x: 0, y: 0, z: 1.5 };
      for (let i = 0; i < TRAIL; i += 1) {
        const point = history[i] || last;
        trail.position.setXYZ(i, point.x, point.y, point.z);
        trail.fade.setX(i, history.length ? (i / (TRAIL - 1)) * 0.85 : 0);
      }
      trail.position.needsUpdate = true;
      trail.fade.needsUpdate = true;
    });
    heat.forEach((count, index) => {
      const mesh = this.heatMeshes[index];
      const material = mesh?.material;
      if (!(material instanceof THREE.MeshBasicMaterial)) return;
      const level = count >= 4 ? 2 : count >= 2 ? 1 : 0;
      material.color.set(HEAT_COLOR[level]);
      material.opacity = count >= 2 ? 0.72 : 0.38;
    });
  }
}

/** 按块包围球做一次视锥判断，块外的实例网格直接不画。 */
export function cullBlocks(camera: THREE.PerspectiveCamera, items: Array<{ mesh: THREE.Object3D; sphere: THREE.Sphere }>) {
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(matrix);
  let hidden = 0;
  items.forEach((item) => {
    const visible = frustum.intersectsSphere(item.sphere);
    item.mesh.visible = visible;
    if (!visible) hidden += 1;
  });
  return hidden;
}

type At = (east: number, north: number, z?: number) => THREE.Vector3;

function heatMesh(lane: LaneSeg, at: At) {
  const length = Math.max(4, Math.hypot(lane.bx - lane.ax, lane.by - lane.ay));
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 5.5, 0.2),
    new THREE.MeshBasicMaterial({ color: HEAT_COLOR[0], transparent: true, opacity: 0.4, depthWrite: false }),
  );
  mesh.position.copy(at((lane.ax + lane.bx) / 2, (lane.ay + lane.by) / 2, 0.45));
  mesh.rotation.z = Math.atan2(lane.by - lane.ay, lane.bx - lane.ax);
  mesh.frustumCulled = false;
  return mesh;
}

function writeCurve(line: THREE.Line | undefined, from: THREE.Vector3, to: THREE.Vector3, lift: number) {
  if (!line) return;
  const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i <= CURVE; i += 1) {
    const t = i / CURVE;
    position.setXYZ(
      i,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      from.z + (to.z - from.z) * t + Math.sin(Math.PI * t) * lift,
    );
  }
  position.needsUpdate = true;
  line.computeLineDistances();
}
