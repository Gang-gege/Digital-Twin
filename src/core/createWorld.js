import * as THREE from 'three';
import {
  buildings,
  devices,
  gates,
  greens,
  pipes,
  roads,
  boundary,
  PARK_CENTER,
} from '../mock/parkData.js';
import { metersToLngLat } from '../utils/coord.js';
import { STATUS_HEX, statusKey } from '../utils/present.js';
import {
  buildFloorLines,
  buildRibbonGeometry,
  buildWindowGeometry,
  createAccessGeometry,
  createCameraGeometry,
  createChargerGeometry,
  createGateGeometry,
  createLampBulbGeometry,
  createLampPoleGeometry,
  disposeObject,
} from '../utils/render.js';
import {
  createAlarmGlowMaterial,
  createFlowMaterial,
  createFlyLineMaterial,
  trackTime,
} from '../shaders/materials.js';

/** 超过这个距离（米级自定义坐标）就换成没有窗和层线的盒子。 */
export const LOD_DISTANCE = 2000;

const TYPE_ORDER = ['camera', 'charger', 'access', 'lamp'];
const GEOMETRY_FACTORY = {
  camera: createCameraGeometry,
  charger: createChargerGeometry,
  access: createAccessGeometry,
  lamp: createLampPoleGeometry,
};
const GLOW_Z = { camera: 2.5, charger: 1.5, access: 1.7, lamp: 4.6 };
const GLOW_SCALE = { camera: 1, charger: 0.82, access: 0.95, lamp: 1.25 };

/**
 * 园区三维内容：白模、道路绿化、管网、实例化设备、飞线、告警光壳。
 * 坐标全部来自 CoordTransformer，不再自己用米去对地图像素。
 */
export class ParkWorld {
  constructor(scene, coord) {
    this.scene = scene;
    this.coord = coord;
    this.center = coord.center;
    this.timeMaterials = [];
    this.records = new Map();
    this.lods = [];
    this.deviceMeshes = {};
    this.pipes = [];
    this.night = false;
    this.alarmVisible = true;
    this.selectedIds = new Set();
    this.selectedBuilding = null;
    this.selectedPipe = null;
    this.tmp = new THREE.Color();
    this.dummy = new THREE.Object3D();
    this.statusColor = {
      normal: new THREE.Color(STATUS_HEX.normal),
      warning: new THREE.Color(STATUS_HEX.warning),
      alarm: new THREE.Color(STATUS_HEX.alarm),
      offline: new THREE.Color(STATUS_HEX.offline),
      selected: new THREE.Color(STATUS_HEX.selected),
    };

    this.origin = coord.toVector(PARK_CENTER[0], PARK_CENTER[1], 0);
    this.baseGroup = new THREE.Group();
    this.baseGroup.name = 'base';
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'buildings';
    this.deviceGroup = new THREE.Group();
    this.deviceGroup.name = 'devices';
    this.pipeGroup = new THREE.Group();
    this.pipeGroup.name = 'pipes';
    this.alarmGroup = new THREE.Group();
    this.alarmGroup.name = 'alarms';
    this.flylineGroup = new THREE.Group();
    this.flylineGroup.name = 'flylines';
    scene.add(
      this.baseGroup,
      this.buildingGroup,
      this.deviceGroup,
      this.pipeGroup,
      this.alarmGroup,
      this.flylineGroup,
    );

    this.addLights();
    this.buildBase();
    this.buildBuildings();
    this.buildPipes();
    this.buildDevices();
    this.buildFlylines();
    this.buildRing();
    this.syncGlow();
  }

  addLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.62);
    this.hemi = new THREE.HemisphereLight(0xe7f0ff, 0x94a3b8, 0.42);
    this.hemi.position.set(0, 0, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.95);
    this.sun.position.set(320, -220, 680);
    this.fill = new THREE.DirectionalLight(0xdbeafe, 0.32);
    this.fill.position.set(-260, 200, 260);
    this.scene.add(this.ambient, this.hemi, this.sun, this.fill);
  }

  worldPoint(x, y, z = 0) {
    const [lng, lat] = metersToLngLat(this.center, x, y);
    return this.coord.toVector(lng, lat, z);
  }

  buildBase() {
    const roadMat = new THREE.MeshPhongMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      shininess: 2,
    });
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    roads.forEach((road) => {
      const points = road.points.map(([x, y]) => this.worldPoint(x, y));
      const geo = buildRibbonGeometry(points, road.width, 0.36);
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.renderOrder = 2;
      mesh.raycast = () => {};
      this.baseGroup.add(mesh);
      if (road.id !== 'R-RING') {
        const center = buildRibbonGeometry(points, 0.45, 0.52);
        if (center) {
          const marking = new THREE.Mesh(center, lineMat);
          marking.renderOrder = 3;
          marking.raycast = () => {};
          this.baseGroup.add(marking);
        }
      }
    });

    const greenMat = new THREE.MeshPhongMaterial({
      color: 0x2f7d62,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
      shininess: 2,
    });
    greens.forEach((green) => {
      const shape = new THREE.Shape();
      green.points.forEach(([x, y], index) => {
        const p = this.worldPoint(x, y, 0);
        if (index === 0) shape.moveTo(p.x, p.y);
        else shape.lineTo(p.x, p.y);
      });
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, greenMat);
      mesh.renderOrder = 1;
      mesh.raycast = () => {};
      this.baseGroup.add(mesh);
    });

    const fencePoints = boundary.slice(0, -1).map(([x, y]) => this.worldPoint(x, y, 1.4));
    const fence = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(fencePoints),
      new THREE.LineBasicMaterial({ color: 0x4c8dff, transparent: true, opacity: 0.85 }),
    );
    fence.raycast = () => {};
    this.baseGroup.add(fence);

    const gateGeo = createGateGeometry();
    const gateMat = new THREE.MeshPhongMaterial({ color: 0xdbe7f5, shininess: 20, specular: 0x334155 });
    gates.forEach((gate) => {
      const mesh = new THREE.Mesh(gateGeo, gateMat);
      const anchor = this.coord.toVector(gate.lng, gate.lat, 0);
      mesh.position.copy(anchor);
      if (gate.id !== 'G-S') mesh.rotation.z = Math.PI / 2;
      mesh.userData = { pickType: 'gate', id: gate.id };
      gate.world = anchor;
      this.baseGroup.add(mesh);
    });
  }

  buildBuildings() {
    buildings.forEach((building) => {
      const { w, d, floors, height } = building;
      const highGeo = new THREE.BoxGeometry(w, d, height);
      highGeo.translate(0, 0, height / 2);
      const lowGeo = highGeo.clone();
      const baseColor = new THREE.Color(building.color);
      const bodyMat = new THREE.MeshPhongMaterial({
        color: baseColor.clone(),
        shininess: 12,
        specular: new THREE.Color('#243044'),
      });
      const lowMat = bodyMat.clone();
      const body = new THREE.Mesh(highGeo, bodyMat);
      const low = new THREE.Mesh(lowGeo, lowMat);
      body.userData = { pickType: 'building', id: building.id };
      low.userData = { pickType: 'building', id: building.id };

      const edgeGeo = new THREE.EdgesGeometry(highGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x8ea6c8, transparent: true, opacity: 0.7 });
      const edges = new THREE.LineSegments(edgeGeo, lineMat);
      const floorsGeo = buildFloorLines(w, d, floors, height / floors);
      const floorLines = new THREE.LineSegments(floorsGeo, lineMat);
      edges.userData = body.userData;
      floorLines.userData = body.userData;

      const winGeo = buildWindowGeometry(w, d, floors, height / floors);
      const winMat = new THREE.MeshBasicMaterial({
        color: 0x16324f,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const windows = new THREE.Mesh(winGeo, winMat);
      windows.userData = body.userData;

      const high = new THREE.Group();
      high.add(body, edges, floorLines, windows);
      if (floors >= 5) {
        const roof = new THREE.BoxGeometry(w * 0.26, d * 0.2, 2.1);
        roof.translate(w * 0.1, -d * 0.06, height + 1.05);
        const roofMesh = new THREE.Mesh(roof, bodyMat);
        roofMesh.userData = body.userData;
        high.add(roofMesh);
      }

      const lod = new THREE.LOD();
      low.visible = false;
      lod.addLevel(high, 0);
      lod.addLevel(low, LOD_DISTANCE);
      const anchor = this.coord.toVector(building.lng, building.lat, 0);
      lod.position.copy(anchor);
      this.buildingGroup.add(lod);
      this.lods.push(lod);
      this.records.set(building.id, {
        data: building,
        lod,
        bodyMat,
        lowMat,
        lineMat,
        winMat,
        baseColor,
        anchor,
        custom: null,
      });
    });
  }

  buildPipes() {
    pipes.forEach((pipe) => {
      const path = [];
      pipe.path.forEach(([x, y], index) => {
        const point = this.worldPoint(x, y, pipe.depth);
        const duplicated = index === pipe.path.length - 1 && path.length && point.distanceTo(path[0]) < 1;
        if (!duplicated) path.push(point);
      });
      const start = this.worldPoint(pipe.path[0][0], pipe.path[0][1], 0.3);
      const last = pipe.path.at(-1);
      const end = this.worldPoint(last[0], last[1], 0.3);
      const curve = new THREE.CatmullRomCurve3([start, ...path, end], false, 'catmullrom', 0.12);
      const segments = Math.min(140, Math.max(28, Math.round(pipe.length / 8)));
      const geo = new THREE.TubeGeometry(curve, segments, 0.55, 8, false);
      const material = trackTime(this.timeMaterials, createFlowMaterial(pipe.color, pipe.speed));
      const mesh = new THREE.Mesh(geo, material);
      mesh.userData = { pickType: 'pipe', id: pipe.id };
      this.pipeGroup.add(mesh);
      const mid = this.worldPoint(pipe.mid[0], pipe.mid[1], 0);
      pipe.world = mid;
      this.pipes.push({ data: pipe, mesh, material });
    });
  }

  buildDevices() {
    TYPE_ORDER.forEach((type) => {
      const list = devices.filter((item) => item.type === type);
      if (!list.length) return;
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        shininess: 16,
        specular: new THREE.Color('#334155'),
      });
      const mesh = new THREE.InstancedMesh(GEOMETRY_FACTORY[type](), material, list.length);
      mesh.frustumCulled = false;
      mesh.userData = { pickType: 'device', devices: list };
      list.forEach((device, index) => {
        const position = this.coord.toVector(device.lng, device.lat, 0);
        device.world = position;
        device.instanceIndex = index;
        device.glowZ = GLOW_Z[type];
        device.glowScale = GLOW_SCALE[type];
        this.dummy.position.copy(position);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
        mesh.setColorAt(index, this.statusColor[statusKey(device)]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.deviceGroup.add(mesh);
      this.deviceMeshes[type] = mesh;
      if (type === 'lamp') this.buildBulbs(list);
    });

    const glowGeo = new THREE.SphereGeometry(2.15, 20, 16);
    this.glowLevels = new Float32Array(devices.length);
    glowGeo.setAttribute('aLevel', new THREE.InstancedBufferAttribute(this.glowLevels, 1));
    const glowMat = trackTime(this.timeMaterials, createAlarmGlowMaterial());
    this.glow = new THREE.InstancedMesh(glowGeo, glowMat, devices.length);
    this.glow.frustumCulled = false;
    this.glow.raycast = () => {};
    this.glow.count = 0;
    this.glow.setColorAt(0, this.statusColor.alarm);
    this.alarmGroup.add(this.glow);
  }

  buildBulbs(lamps) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bulbs = new THREE.InstancedMesh(createLampBulbGeometry(), material, lamps.length);
    this.bulbs.frustumCulled = false;
    this.bulbs.userData = { pickType: 'device', devices: lamps };
    lamps.forEach((device, index) => {
      this.dummy.position.set(device.world.x, device.world.y, 6.28);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.bulbs.setMatrixAt(index, this.dummy.matrix);
      this.bulbs.setColorAt(index, new THREE.Color('#667084'));
    });
    this.bulbs.instanceMatrix.needsUpdate = true;
    this.bulbs.instanceColor.needsUpdate = true;
    this.deviceGroup.add(this.bulbs);
    this.lamps = lamps;
  }

  buildFlylines() {
    const material = trackTime(this.timeMaterials, createFlyLineMaterial('#7dd3fc'));
    const pairs = [
      [gates.find((g) => g.id === 'G-S'), devices.find((d) => d.key && d.buildingId === 'B01')],
      [gates.find((g) => g.id === 'G-S'), devices.find((d) => d.key && d.buildingId === 'B04')],
      [gates.find((g) => g.id === 'G-E'), devices.find((d) => d.type === 'charger' && d.key)],
      [gates.find((g) => g.id === 'G-W'), devices.find((d) => d.key && d.buildingId === 'B07')],
    ];
    pairs.forEach(([gate, device]) => {
      if (!gate || !device?.world) return;
      const start = this.coord.toVector(gate.lng, gate.lat, 3.2);
      const end = device.world.clone();
      end.z = device.elev + 0.4;
      const distance = start.distanceTo(end);
      const mid = new THREE.Vector3(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        Math.max(42, Math.min(96, distance * 0.42)),
      );
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.42, 6, false), material);
      mesh.raycast = () => {};
      mesh.renderOrder = 4;
      this.flylineGroup.add(mesh);
    });
  }

  buildRing() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.22, 48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.ring.raycast = () => {};
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    this.scene.add(this.ring);
  }

  updateEffects(time) {
    this.timeMaterials.forEach((material) => {
      material.uniforms.uTime.value = time;
    });
    if (this.ring.visible) {
      this.ring.material.opacity = 0.4 + 0.55 * (0.5 + 0.5 * Math.sin(time * 4));
    }
    this.pulseColors(time);
  }

  updateLod(camera) {
    this.lods.forEach((lod) => lod.update(camera));
  }

  lodState(camera) {
    return camera.position.distanceTo(this.origin) > LOD_DISTANCE ? '远景简化' : '近景精细';
  }

  pulseColors(time) {
    devices.forEach((device) => {
      const mesh = this.deviceMeshes[device.type];
      if (!mesh) return;
      if (this.selectedIds.has(device.id)) {
        mesh.setColorAt(device.instanceIndex, this.statusColor.selected);
        return;
      }
      const base = this.statusColor[statusKey(device)];
      const flashing = this.alarmVisible && device.online && (device.status === 'warning' || device.status === 'alarm');
      if (!flashing) {
        mesh.setColorAt(device.instanceIndex, base);
        return;
      }
      const speed = device.status === 'alarm' ? 8 : 4.2;
      const scale = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * speed + device.instanceIndex));
      mesh.setColorAt(device.instanceIndex, this.tmp.copy(base).multiplyScalar(scale));
    });
    Object.values(this.deviceMeshes).forEach((mesh) => {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  setAlarmVisible(visible) {
    this.alarmVisible = visible;
    this.syncGlow();
  }

  syncGlow() {
    if (!this.glow) return;
    const list = devices.filter((device) => device.online && (device.status === 'warning' || device.status === 'alarm'));
    if (!this.alarmVisible || !list.length) {
      this.glow.visible = false;
      this.glow.count = 0;
      return;
    }
    this.glow.visible = true;
    list.forEach((device, index) => {
      this.dummy.position.set(device.world.x, device.world.y, device.glowZ || 2);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(device.glowScale || 1);
      this.dummy.updateMatrix();
      this.glow.setMatrixAt(index, this.dummy.matrix);
      this.glow.setColorAt(index, device.status === 'alarm' ? this.statusColor.alarm : this.statusColor.warning);
      this.glowLevels[index] = device.status === 'alarm' ? 2 : 1;
    });
    this.glow.count = list.length;
    this.glow.instanceMatrix.needsUpdate = true;
    this.glow.instanceColor.needsUpdate = true;
    this.glow.geometry.attributes.aLevel.needsUpdate = true;
  }

  refreshBulbs() {
    if (!this.bulbs) return;
    this.lamps.forEach((device) => {
      const color = this.night && device.online ? '#ffc56d' : '#667084';
      this.bulbs.setColorAt(device.instanceIndex, this.tmp.set(color));
    });
    this.bulbs.instanceColor.needsUpdate = true;
  }

  setTimeOfDay(mode) {
    this.night = mode === 'night';
    this.ambient.intensity = this.night ? 0.16 : 0.62;
    this.hemi.intensity = this.night ? 0.08 : 0.42;
    this.hemi.color.set(this.night ? 0x1e293b : 0xe7f0ff);
    this.sun.intensity = this.night ? 0.22 : 0.95;
    this.sun.color.set(this.night ? 0x9db4ff : 0xffffff);
    this.fill.intensity = this.night ? 0.08 : 0.32;
    this.records.forEach((record) => {
      const color = record.baseColor.clone();
      if (this.night) {
        color.multiplyScalar(0.32);
        color.b = Math.min(1, color.b + 0.06);
      }
      record.bodyMat.color.copy(color);
      record.lowMat.color.copy(color);
      record.bodyMat.emissive.set(this.night ? 0x10203a : 0x000000);
      record.bodyMat.emissiveIntensity = this.night ? 0.3 : 0;
      record.lowMat.emissive.copy(record.bodyMat.emissive);
      record.lowMat.emissiveIntensity = record.bodyMat.emissiveIntensity;
      record.winMat.color.set(this.night ? 0xffd8a8 : 0x16324f);
    });
    devices.forEach((device) => {
      if (device.type === 'lamp') device.telemetry.value = this.night && device.online ? 88 : 0;
    });
    this.refreshBulbs();
  }

  highlight(payload) {
    this.selectedIds = new Set(payload?.ids || []);
    this.selectedBuilding = payload?.kind === 'building' ? payload.id : null;
    this.selectedPipe = payload?.kind === 'pipe' ? payload.id : null;
    this.records.forEach((record) => {
      const on = record.data.id === this.selectedBuilding;
      record.bodyMat.emissive.set(on ? 0x1d4ed8 : (this.night ? 0x10203a : 0x000000));
      record.bodyMat.emissiveIntensity = on ? 0.75 : (this.night ? 0.3 : 0);
      record.lowMat.emissive.copy(record.bodyMat.emissive);
      record.lowMat.emissiveIntensity = record.bodyMat.emissiveIntensity;
      record.lineMat.color.set(on ? 0x7db2ff : 0x8ea6c8);
      record.lineMat.opacity = on ? 1 : 0.7;
    });
    this.pipes.forEach((pipe) => {
      pipe.material.uniforms.uHighlight.value = pipe.data.id === this.selectedPipe ? 1 : 0;
    });

    if (!payload || payload.kind === 'multi') {
      this.ring.visible = false;
      return;
    }
    const anchor = this.anchorOf(payload);
    if (!anchor) {
      this.ring.visible = false;
      return;
    }
    this.ring.visible = true;
    this.ring.position.set(anchor.x, anchor.y, 0.85);
    this.ring.scale.setScalar(anchor.radius);
  }

  anchorOf(payload) {
    if (payload.kind === 'building') {
      const record = this.records.get(payload.id);
      if (!record) return null;
      return { x: record.anchor.x, y: record.anchor.y, radius: Math.max(record.data.w, record.data.d) * 0.56 };
    }
    if (payload.kind === 'device') {
      const device = devices.find((item) => item.id === payload.id);
      if (!device?.world) return null;
      return { x: device.world.x, y: device.world.y, radius: 2.8 };
    }
    if (payload.kind === 'pipe') {
      const pipe = pipes.find((item) => item.id === payload.id);
      if (!pipe?.world) return null;
      return { x: pipe.world.x, y: pipe.world.y, radius: 5 };
    }
    if (payload.kind === 'gate') {
      const gate = gates.find((item) => item.id === payload.id);
      if (!gate?.world) return null;
      return { x: gate.world.x, y: gate.world.y, radius: 6.5 };
    }
    return null;
  }

  attachModel(buildingId, holder) {
    const record = this.records.get(buildingId);
    if (!record) return false;
    this.detachModel(buildingId);
    holder.position.set(record.anchor.x, record.anchor.y, 0);
    holder.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.pickType = 'building';
        obj.userData.id = buildingId;
      }
    });
    this.buildingGroup.add(holder);
    record.lod.visible = false;
    record.custom = holder;
    return true;
  }

  detachModel(buildingId) {
    const record = this.records.get(buildingId);
    if (!record?.custom) return;
    this.buildingGroup.remove(record.custom);
    disposeObject(record.custom);
    record.custom = null;
    record.lod.visible = true;
  }

  getPickables() {
    const list = [];
    const collect = (root) => {
      root.traverse((obj) => {
        if (!obj.userData?.pickType || !obj.visible) return;
        if (!visibleChain(obj)) return;
        list.push(obj);
      });
    };
    collect(this.buildingGroup);
    collect(this.deviceGroup);
    collect(this.pipeGroup);
    collect(this.baseGroup);
    return list;
  }

  dispose() {
    [this.baseGroup, this.buildingGroup, this.deviceGroup, this.pipeGroup, this.alarmGroup, this.flylineGroup, this.ring]
      .forEach((obj) => disposeObject(obj));
  }
}

function visibleChain(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}
