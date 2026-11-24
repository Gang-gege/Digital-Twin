import * as THREE from 'three';

/** 白模几何。GLTF 替换时只换岸桥外观，吊具节点仍由动画器驱动。 */

export function createContainerGeometry() {
  return new THREE.BoxGeometry(12, 2.28, 2.55);
}

export function createTruckGeometry() {
  const geo = new THREE.BoxGeometry(2.35, 6.8, 2.05);
  geo.translate(0, 0.2, 1.25);
  return geo;
}

export function createCameraGeometry() {
  const geo = new THREE.BoxGeometry(0.45, 0.7, 0.45);
  geo.translate(0, 0, 4.4);
  return geo;
}

export function createLampGeometry() {
  const geo = new THREE.BoxGeometry(0.28, 0.28, 7.2);
  geo.translate(0, 0, 3.6);
  return geo;
}

export function createBulbGeometry() {
  const geo = new THREE.BoxGeometry(1.1, 1.1, 0.28);
  geo.translate(0, 0, 7.3);
  return geo;
}

export function createWeighGeometry() {
  const geo = new THREE.BoxGeometry(4.4, 15, 0.4);
  geo.translate(0, 0, 0.22);
  return geo;
}

export interface CraneParts {
  group: THREE.Group;
  trolley: THREE.Group;
  spreader: THREE.Group;
  box: THREE.Mesh;
  boxMat: THREE.MeshPhongMaterial;
  ring: THREE.Mesh;
  body: THREE.Mesh[];
}

/** 岸桥白模：门架固定，小车沿南北移动，吊具沿高度移动，箱体挂在吊具下。 */
export function buildCraneParts(id: string, steel: THREE.Material): CraneParts {
  const group = new THREE.Group();
  group.name = id;
  const body: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(1.5, 1.5, 32);
  [[-6, -8], [6, -8], [-6, 14], [6, 14]].forEach(([x, y]) => {
    const leg = new THREE.Mesh(legGeo, steel);
    leg.position.set(x || 0, y || 0, 16);
    tag(leg, id);
    group.add(leg);
    body.push(leg);
  });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(14, 26, 1.3), steel);
  sill.position.set(0, 3, 32.4);
  tag(sill, id);
  group.add(sill);
  body.push(sill);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.8, 72, 1.35), steel);
  boom.position.set(0, -12, 36.4);
  tag(boom, id);
  group.add(boom);
  body.push(boom);

  const trolley = new THREE.Group();
  trolley.position.set(0, 8, 34.6);
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 1.15), steel);
  tag(carriage, id);
  trolley.add(carriage);
  body.push(carriage);

  const spreader = new THREE.Group();
  spreader.position.set(0, 0, -8);
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(12.2, 1.15, 0.45),
    new THREE.MeshPhongMaterial({ color: 0xc2410c }),
  );
  tag(bar, id);
  spreader.add(bar);

  const boxMat = new THREE.MeshPhongMaterial({ color: 0xe07a3d });
  const box = new THREE.Mesh(new THREE.BoxGeometry(12, 2.3, 2.5), boxMat);
  box.position.set(0, 0, -1.7);
  box.visible = false;
  tag(box, id);
  spreader.add(box);
  trolley.add(spreader);
  group.add(trolley);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(7.5, 8.8, 28),
    new THREE.MeshBasicMaterial({ color: 0xfde68a, side: THREE.DoubleSide }),
  );
  ring.position.z = 0.55;
  ring.visible = false;
  group.add(ring);
  return { group, trolley, spreader, box, boxMat, ring, body };
}

export function buildShip() {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(78, 18, 7),
    new THREE.MeshPhongMaterial({ color: 0x1e3a4c }),
  );
  hull.position.z = 4;
  group.add(hull);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(70, 14, 2.4),
    new THREE.MeshPhongMaterial({ color: 0xc2410c }),
  );
  deck.position.z = 8.2;
  group.add(deck);
  return group;
}

export function buildGate() {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: 0xd6dee8 });
  [-8, 8].forEach((x) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 8), mat);
    pillar.position.set(x, 0, 4);
    pillar.userData = { pickType: 'gate', id: 'GATE-1' };
    group.add(pillar);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 1), mat);
  beam.position.set(0, 0, 8.2);
  beam.userData = { pickType: 'gate', id: 'GATE-1' };
  group.add(beam);
  return group;
}

export function buildFlood() {
  const geo = new THREE.ConeGeometry(11, 26, 10, 1, true);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -8);
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: 0xffe3a3,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

function tag(mesh: THREE.Mesh, id: string) {
  mesh.userData = { pickType: 'crane', id };
}
