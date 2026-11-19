import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 渲染用的几何体小工具。
 * 本场景是 Z 轴向上（高德 customCoords：x 东、y 北、z 上），
 * Three 默认几何体是 Y 轴向上，所以立柱都先绕 X 轴转 90° 再摆放。
 */

export function mergeParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  parts.forEach((geo) => geo.dispose());
  if (!merged) throw new Error('几何体合并失败');
  return merged;
}

function pole(radiusTop: number, radiusBottom: number, height: number, zBase = 0) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 8);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, zBase + height / 2);
  return geo;
}

/** 摄像头：立杆 + 机身 + 镜头。底面落在 z = 0。 */
export function createCameraGeometry() {
  const body = new THREE.BoxGeometry(0.55, 0.42, 0.38);
  body.translate(0, 0, 3.15);
  const lens = new THREE.CylinderGeometry(0.1, 0.16, 0.36, 8);
  lens.rotateX(Math.PI / 2);
  lens.rotateZ(Math.PI / 2);
  lens.translate(0, 0.34, 3.15);
  return mergeParts([pole(0.06, 0.09, 3.0), body, lens]);
}

/** 充电桩。 */
export function createChargerGeometry() {
  const body = new THREE.BoxGeometry(0.72, 0.42, 1.45);
  body.translate(0, 0, 0.78);
  const cap = new THREE.BoxGeometry(0.5, 0.28, 0.12);
  cap.translate(0, 0, 1.56);
  const cable = new THREE.BoxGeometry(0.08, 0.08, 0.7);
  cable.translate(0.28, 0.18, 0.7);
  return mergeParts([body, cap, cable]);
}

/** 门禁闸机。 */
export function createAccessGeometry() {
  const left = new THREE.BoxGeometry(0.18, 0.22, 1.35);
  left.translate(-0.55, 0, 0.68);
  const right = new THREE.BoxGeometry(0.18, 0.22, 1.35);
  right.translate(0.55, 0, 0.68);
  const bar = new THREE.BoxGeometry(1.28, 0.16, 0.12);
  bar.translate(0, 0, 1.38);
  return mergeParts([left, right, bar]);
}

/** 路灯灯杆。灯头单独做实例，方便夜里单独点亮。 */
export function createLampPoleGeometry() {
  const arm = new THREE.BoxGeometry(0.9, 0.08, 0.08);
  arm.translate(0.35, 0, 6.15);
  return mergeParts([pole(0.07, 0.12, 6.1), arm]);
}

export function createLampBulbGeometry() {
  return new THREE.SphereGeometry(0.22, 10, 8);
}

export function createGateGeometry() {
  const left = new THREE.BoxGeometry(0.45, 0.45, 4.2);
  left.translate(-3.2, 0, 2.1);
  const right = new THREE.BoxGeometry(0.45, 0.45, 4.2);
  right.translate(3.2, 0, 2.1);
  const beam = new THREE.BoxGeometry(6.8, 0.4, 0.35);
  beam.translate(0, 0, 4.15);
  const sign = new THREE.BoxGeometry(2.2, 0.12, 0.7);
  sign.translate(0, 0, 3.5);
  return mergeParts([left, right, beam, sign]);
}

/**
 * 把一条折线铺成平面道路。
 * points 为世界坐标 Vector3（只需 x/y），z 由参数统一抬高，避免和绿地抢深度。
 */
export function buildRibbonGeometry(rawPoints: Array<{ x: number; y: number }>, width: number, z = 0.35) {
  const points = rawPoints.map((p) => new THREE.Vector3(p.x, p.y, z));
  const closed = points.length > 2 && points[0] && points[points.length - 1]
    ? points[0].distanceTo(points[points.length - 1]!) < 0.2
    : false;
  if (closed) points.pop();
  const count = points.length;
  if (count < 2) return null;

  const half = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  const at = (index: number) => {
    if (closed) return points[(index + count) % count]!;
    return points[Math.max(0, Math.min(count - 1, index))]!;
  };

  for (let i = 0; i < count; i += 1) {
    let dir: THREE.Vector3;
    if (!closed && i === 0) dir = at(1).clone().sub(at(0));
    else if (!closed && i === count - 1) dir = at(count - 1).clone().sub(at(count - 2));
    else dir = at(i + 1).clone().sub(at(i - 1));
    dir.z = 0;
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    const side = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(half);
    const p = points[i]!;
    positions.push(p.x + side.x, p.y + side.y, z, p.x - side.x, p.y - side.y, z);
  }

  const segments = closed ? count : count - 1;
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = ((i + 1) % count) * 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 楼层分格线，局部坐标，底面在 z = 0。 */
export function buildFloorLines(width: number, depth: number, floors: number, floorHeight: number) {
  const hw = width / 2;
  const hd = depth / 2;
  const positions: number[] = [];
  for (let i = 1; i < floors; i += 1) {
    const z = i * floorHeight;
    positions.push(
      -hw, -hd, z, hw, -hd, z,
      hw, -hd, z, hw, hd, z,
      hw, hd, z, -hw, hd, z,
      -hw, hd, z, -hw, -hd, z,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/**
 * 四面窗格，合并成一个几何体。
 * 只作为近景 LOD 的一部分，远景白模不带窗户。
 */
export function buildWindowGeometry(width: number, depth: number, floors: number, floorHeight: number) {
  const geos: THREE.PlaneGeometry[] = [];
  const colsX = Math.min(6, Math.max(2, Math.round(width / 8)));
  const colsY = Math.min(4, Math.max(2, Math.round(depth / 10)));
  const winW = Math.min(1.5, (width / colsX) * 0.42);
  const winH = Math.min(1.15, floorHeight * 0.38);

  // 先绕 X 把平面立起来：高度沿 Z，法线朝南（-Y），再绕 Z 转到各立面。
  const add = (x: number, y: number, z: number, turn: number) => {
    const geo = new THREE.PlaneGeometry(winW, winH);
    geo.rotateX(Math.PI / 2);
    if (turn) geo.rotateZ(turn);
    geo.translate(x, y, z);
    geos.push(geo);
  };

  for (let floor = 0; floor < floors; floor += 1) {
    const z = floor * floorHeight + floorHeight * 0.55;
    for (let col = 0; col < colsX; col += 1) {
      const x = -width / 2 + ((col + 0.5) * width) / colsX;
      add(x, -depth / 2 - 0.08, z, 0);
      add(x, depth / 2 + 0.08, z, Math.PI);
    }
    for (let col = 0; col < colsY; col += 1) {
      const y = -depth / 2 + ((col + 0.5) * depth) / colsY;
      add(width / 2 + 0.08, y, z, Math.PI / 2);
      add(-width / 2 - 0.08, y, z, -Math.PI / 2);
    }
  }

  return mergeParts(geos);
}

export function disposeObject(root?: THREE.Object3D | null) {
  if (!root) return;
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((item) => {
      if (item && !materials.has(item)) {
        materials.add(item);
        item.dispose?.();
      }
    });
  });
}
