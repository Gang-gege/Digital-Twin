import * as THREE from 'three';
import {
  buildings,
  devices,
  forklifts,
  gates,
  greens,
  hazards,
  pipes,
  roads,
  boundary,
  PARK_CENTER,
} from '../mock/parkData';
import type { AlarmRecord, Building, Device, DeviceType, Pipe, SelectionPayload, StatusKey, TimeMode, WeatherMode } from '../types/park';
import { metersToLngLat } from '../../utils/coord';
import type { CoordTransformer } from '../../utils/coord';
import { STATUS_HEX, statusKey } from '../utils/present';
import {
  buildFloorLines,
  buildRibbonGeometry,
  buildWindowGeometry,
  createAccessGeometry,
  createCameraGeometry,
  createDockGeometry,
  createForkliftGeometry,
  createGateGeometry,
  createHydrantGeometry,
  createLampBulbGeometry,
  createLampPoleGeometry,
  createMeterGeometry,
  disposeObject,
} from '../utils/render';
import {
  createAlarmGlowMaterial,
  createFlowMaterial,
  createFlyLineMaterial,
  trackTime,
} from '../shaders/materials';

/** 超过这个距离（米级自定义坐标）就换成没有窗和层线的盒子。 */
export const LOD_DISTANCE = 2000;

const TYPE_ORDER: DeviceType[] = ['camera', 'hydrant', 'meter', 'access', 'lamp', 'dock'];
const GEOMETRY_FACTORY: Record<DeviceType, () => THREE.BufferGeometry> = {
  camera: createCameraGeometry,
  hydrant: createHydrantGeometry,
  meter: createMeterGeometry,
  access: createAccessGeometry,
  lamp: createLampPoleGeometry,
  dock: createDockGeometry,
};
const GLOW_Z: Record<DeviceType, number> = { camera: 2.6, hydrant: 1.2, meter: 1.5, access: 1.7, lamp: 4.6, dock: 0.8 };
const GLOW_SCALE: Record<DeviceType, number> = { camera: 1, hydrant: 0.7, meter: 0.75, access: 0.95, lamp: 1.25, dock: 1.1 };

interface BuildingRecord {
  data: Building;
  lod: THREE.LOD;
  bodyMat: THREE.MeshPhongMaterial;
  lowMat: THREE.MeshPhongMaterial;
  lineMat: THREE.LineBasicMaterial;
  winMat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  anchor: THREE.Vector3;
  custom: THREE.Object3D | null;
}

interface PipeMesh {
  data: Pipe;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  baseSpeed: number;
}

/**
 * 园区三维内容：白模、道路绿化、管网、实例化设备、飞线、告警光壳。
 * 坐标全部来自 CoordTransformer，不再自己用米去对地图像素。
 */
export class ParkWorld {
  declare scene: THREE.Scene;
  declare coord: CoordTransformer;
  declare center: CoordTransformer['center'];
  declare timeMaterials: THREE.ShaderMaterial[];
  declare records: Map<string, BuildingRecord>;
  declare lods: THREE.LOD[];
  declare deviceMeshes: Partial<Record<DeviceType, THREE.InstancedMesh>>;
  declare pipes: PipeMesh[];
  declare night: boolean;
  declare alarmVisible: boolean;
  declare selectedIds: Set<string>;
  declare selectedBuilding: string | null;
  declare selectedPipe: string | null;
  declare tmp: THREE.Color;
  declare dummy: THREE.Object3D;
  declare statusColor: Record<StatusKey, THREE.Color>;
  declare origin: THREE.Vector3;
  declare baseGroup: THREE.Group;
  declare buildingGroup: THREE.Group;
  declare deviceGroup: THREE.Group;
  declare pipeGroup: THREE.Group;
  declare alarmGroup: THREE.Group;
  declare flylineGroup: THREE.Group;
  declare wallGroup: THREE.Group;
  declare hazardGroup: THREE.Group;
  declare gridGroup: THREE.Group;
  declare rulerGroup: THREE.Group;
  declare forkliftGroup: THREE.Group;
  declare alarmLinkGroup: THREE.Group;
  declare linkMaterials: Record<'info' | 'warning' | 'urgent', THREE.ShaderMaterial>;
  declare forkliftMesh: THREE.InstancedMesh;
  declare forkliftProgress: number[];
  declare forkliftSpeedScale: number;
  declare weather: WeatherMode;
  declare rain?: THREE.Points;
  declare ambient: THREE.AmbientLight;
  declare hemi: THREE.HemisphereLight;
  declare sun: THREE.DirectionalLight;
  declare fill: THREE.DirectionalLight;
  declare glowLevels: Float32Array;
  declare glow: THREE.InstancedMesh;
  declare bulbs?: THREE.InstancedMesh;
  declare lamps: Device[];
  declare ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene, coord: CoordTransformer) {
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
      info: new THREE.Color(STATUS_HEX.info),
      warning: new THREE.Color(STATUS_HEX.warning),
      urgent: new THREE.Color(STATUS_HEX.urgent),
      offline: new THREE.Color(STATUS_HEX.offline),
      selected: new THREE.Color(STATUS_HEX.selected),
    };
    this.lamps = [];

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
    this.wallGroup = new THREE.Group();
    this.wallGroup.name = 'walls';
    this.hazardGroup = new THREE.Group();
    this.hazardGroup.name = 'hazard';
    this.gridGroup = new THREE.Group();
    this.gridGroup.name = 'grid';
    this.gridGroup.visible = false;
    this.rulerGroup = new THREE.Group();
    this.rulerGroup.name = 'ruler';
    this.rulerGroup.visible = false;
    this.forkliftGroup = new THREE.Group();
    this.forkliftGroup.name = 'forklifts';
    this.alarmLinkGroup = new THREE.Group();
    this.alarmLinkGroup.name = 'alarm-links';
    this.flylineGroup.add(this.alarmLinkGroup);
    this.forkliftSpeedScale = 1;
    this.weather = 'clear';
    scene.add(
      this.baseGroup,
      this.wallGroup,
      this.buildingGroup,
      this.hazardGroup,
      this.deviceGroup,
      this.pipeGroup,
      this.alarmGroup,
      this.flylineGroup,
      this.forkliftGroup,
      this.gridGroup,
      this.rulerGroup,
    );

    this.addLights();
    this.buildBase();
    this.buildWalls();
    this.buildHazard();
    this.buildBuildings();
    this.buildPipes();
    this.buildDevices();
    this.buildForklifts();
    this.buildGrid();
    this.buildRuler();
    this.buildRain();
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

  worldPoint(x: number, y: number, z = 0) {
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
    const gateMat = new THREE.MeshPhongMaterial({ color: 0xdbe7f5, shininess: 20, specular: new THREE.Color('#334155') });
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
      const path: THREE.Vector3[] = [];
      pipe.path.forEach(([x, y], index) => {
        const point = this.worldPoint(x, y, pipe.depth);
        const duplicated = index === pipe.path.length - 1 && path.length && path[0] && point.distanceTo(path[0]) < 1;
        if (!duplicated) path.push(point);
      });
      const start = this.worldPoint(pipe.path[0]![0], pipe.path[0]![1], 0.3);
      const last = pipe.path[pipe.path.length - 1] ?? pipe.path[0] ?? [0, 0];
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
      this.pipes.push({ data: pipe, mesh, material, baseSpeed: pipe.speed });
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
      mesh.frustumCulled = true;
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
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
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
    this.glow.setColorAt(0, this.statusColor.urgent);
    this.alarmGroup.add(this.glow);
  }

  buildBulbs(lamps: Device[]) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bulbs = new THREE.InstancedMesh(createLampBulbGeometry(), material, lamps.length);
    this.bulbs.frustumCulled = false;
    this.bulbs.userData = { pickType: 'device', devices: lamps };
    lamps.forEach((device, index) => {
      if (!device.world) return;
      this.dummy.position.set(device.world.x, device.world.y, 6.28);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.bulbs?.setMatrixAt(index, this.dummy.matrix);
      this.bulbs?.setColorAt(index, new THREE.Color('#667084'));
    });
    this.bulbs.instanceMatrix.needsUpdate = true;
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.deviceGroup.add(this.bulbs);
    this.lamps = lamps;
  }

  buildFlylines() {
    const material = trackTime(this.timeMaterials, createFlyLineMaterial('#7dd3fc'));
    const pairs: Array<[typeof gates[number] | undefined, Device | undefined]> = [
      [gates.find((g) => g.id === 'G-S'), devices.find((d) => d.key && d.buildingId === 'P01')],
      [gates.find((g) => g.id === 'G-E'), devices.find((d) => d.key && d.type === 'meter')],
      [gates.find((g) => g.id === 'G-W'), devices.find((d) => d.key && d.buildingId === 'H01')],
      [gates.find((g) => g.id === 'G-S'), devices.find((d) => d.type === 'hydrant' && d.status === 'urgent')],
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

  updateEffects(time: number) {
    this.timeMaterials.forEach((material) => {
      const uniform = material.uniforms.uTime;
      if (uniform) uniform.value = time;
    });
    if (this.ring.visible) {
      this.ring.material.opacity = 0.4 + 0.55 * (0.5 + 0.5 * Math.sin(time * 4));
    }
    this.pulseColors(time);
  }

  updateLod(camera: THREE.Camera) {
    this.lods.forEach((lod) => lod.update(camera));
    const far = camera.position.distanceTo(this.origin) > LOD_DISTANCE;
    if (this.bulbs) this.bulbs.visible = !far && this.layersDeviceVisible();
  }

  private layersDeviceVisible() {
    return this.deviceGroup.visible;
  }

  lodState(camera: THREE.Camera) {
    return camera.position.distanceTo(this.origin) > LOD_DISTANCE ? '远景简化' : '近景精细';
  }

  pulseColors(time: number) {
    devices.forEach((device) => {
      const mesh = this.deviceMeshes[device.type];
      if (!mesh || device.instanceIndex == null) return;
      if (this.selectedIds.has(device.id)) {
        mesh.setColorAt(device.instanceIndex, this.statusColor.selected);
        return;
      }
      const base = this.statusColor[statusKey(device)];
      const flashing = this.alarmVisible && device.online && device.status !== 'normal';
      if (!flashing) {
        mesh.setColorAt(device.instanceIndex, base);
        return;
      }
      const speed = device.status === 'urgent' ? 8 : device.status === 'warning' ? 4.2 : 2.4;
      const scale = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * speed + device.instanceIndex));
      mesh.setColorAt(device.instanceIndex, this.tmp.copy(base).multiplyScalar(scale));
    });
    Object.values(this.deviceMeshes).forEach((mesh) => {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  setAlarmVisible(visible: boolean) {
    this.alarmVisible = visible;
    this.syncGlow();
  }

  syncGlow() {
    if (!this.glow) return;
    const list = devices.filter((device) => device.online && device.status !== 'normal');
    if (!this.alarmVisible || !list.length) {
      this.glow.visible = false;
      this.glow.count = 0;
      return;
    }
    this.glow.visible = true;
    list.forEach((device, index) => {
      if (!device.world) return;
      this.dummy.position.set(device.world.x, device.world.y, device.glowZ || 2);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(device.glowScale || 1);
      this.dummy.updateMatrix();
      this.glow.setMatrixAt(index, this.dummy.matrix);
      this.glow.setColorAt(index, this.statusColor[device.status]);
      this.glowLevels[index] = device.status === 'urgent' ? 3 : device.status === 'warning' ? 2 : 1;
    });
    this.glow.count = list.length;
    this.glow.instanceMatrix.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
    this.glow.computeBoundingSphere();
    const level = this.glow.geometry.getAttribute('aLevel');
    if (level) level.needsUpdate = true;
  }

  refreshBulbs() {
    if (!this.bulbs) return;
    this.lamps.forEach((device) => {
      if (device.instanceIndex == null) return;
      const color = this.night && device.online ? '#ffc56d' : '#667084';
      this.bulbs?.setColorAt(device.instanceIndex, this.tmp.set(color));
    });
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  setTimeOfDay(mode: TimeMode) {
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
      const lit = this.night && ['生产', '水务', '电力', '危化'].includes(record.data.usage);
      record.winMat.color.set(lit ? 0xffc56d : this.night ? 0x1e3a5f : 0x16324f);
    });
    this.refreshBulbs();
  }

  highlight(payload: SelectionPayload | null) {
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
      const highlight = pipe.material.uniforms.uHighlight;
      if (highlight) highlight.value = pipe.data.id === this.selectedPipe ? 1 : 0;
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

  anchorOf(payload: SelectionPayload) {
    if (payload.kind === 'building' && payload.id) {
      const record = this.records.get(payload.id);
      if (!record) return null;
      return { x: record.anchor.x, y: record.anchor.y, radius: Math.max(record.data.w, record.data.d) * 0.56 };
    }
    if (payload.kind === 'device' && payload.id) {
      const device = devices.find((item) => item.id === payload.id);
      if (!device?.world) return null;
      return { x: device.world.x, y: device.world.y, radius: 2.8 };
    }
    if (payload.kind === 'pipe' && payload.id) {
      const pipe = pipes.find((item) => item.id === payload.id);
      if (!pipe?.world) return null;
      return { x: pipe.world.x, y: pipe.world.y, radius: 5 };
    }
    if (payload.kind === 'gate' && payload.id) {
      const gate = gates.find((item) => item.id === payload.id);
      if (!gate?.world) return null;
      return { x: gate.world.x, y: gate.world.y, radius: 6.5 };
    }
    return null;
  }

  attachModel(buildingId: string, holder: THREE.Object3D) {
    const record = this.records.get(buildingId);
    if (!record) return false;
    this.detachModel(buildingId);
    holder.position.set(record.anchor.x, record.anchor.y, 0);
    holder.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.userData.pickType = 'building';
        obj.userData.id = buildingId;
      }
    });
    this.buildingGroup.add(holder);
    record.lod.visible = false;
    record.custom = holder;
    return true;
  }

  detachModel(buildingId: string) {
    const record = this.records.get(buildingId);
    if (!record?.custom) return;
    this.buildingGroup.remove(record.custom);
    disposeObject(record.custom);
    record.custom = null;
    record.lod.visible = true;
  }

  getPickables() {
    const list: THREE.Object3D[] = [];
    const collect = (root: THREE.Object3D) => {
      root.traverse((obj) => {
        if (!obj.userData?.pickType || !obj.visible) return;
        if (!visibleChain(obj)) return;
        list.push(obj);
      });
    };
    collect(this.buildingGroup);
    collect(this.hazardGroup);
    collect(this.deviceGroup);
    collect(this.pipeGroup);
    collect(this.baseGroup);
    return list;
  }

  buildWalls() {
    const material = new THREE.MeshPhongMaterial({ color: 0xc5d0d8, shininess: 8 });
    for (let i = 0; i < boundary.length - 1; i += 1) {
      const start = boundary[i];
      const end = boundary[i + 1];
      if (!start || !end) continue;
      const a = this.worldPoint(start[0], start[1], 0);
      const b = this.worldPoint(end[0], end[1], 0);
      const length = a.distanceTo(b);
      const geo = new THREE.BoxGeometry(length, 0.45, 2.4);
      geo.translate(0, 0, 1.2);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      mesh.raycast = () => {};
      this.wallGroup.add(mesh);
    }
  }

  buildHazard() {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff5a62,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    hazards.forEach((zone) => {
      const shape = new THREE.Shape();
      zone.points.forEach(([x, y], index) => {
        const point = this.worldPoint(x, y, 0);
        if (index === 0) shape.moveTo(point.x, point.y);
        else shape.lineTo(point.x, point.y);
      });
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }), material);
      mesh.userData = { pickType: 'building', id: zone.buildingId };
      this.hazardGroup.add(mesh);
    });
  }

  buildForklifts() {
    const material = new THREE.MeshPhongMaterial({ color: 0xf2b134, shininess: 18 });
    this.forkliftMesh = new THREE.InstancedMesh(createForkliftGeometry(), material, forklifts.length);
    this.forkliftProgress = forklifts.map((unit) => unit.progress);
    this.forkliftMesh.userData = { pickType: 'device', devices: [] };
    this.forkliftGroup.add(this.forkliftMesh);
    forklifts.forEach((unit) => this.addRouteRibbon(unit.route));
    this.updateForklifts(0);
    this.forkliftMesh.computeBoundingSphere();
  }

  addRouteRibbon(route: Array<[number, number]>) {
    const points = route.map(([x, y]) => this.worldPoint(x, y, 0.4));
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
    const material = trackTime(this.timeMaterials, createFlyLineMaterial('#f2b134'));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.28, 5, false), material);
    mesh.raycast = () => {};
    this.flylineGroup.add(mesh);
  }

  buildGrid() {
    const positions: number[] = [];
    for (let east = -200; east <= 200; east += 20) {
      const a = this.worldPoint(east, -160, 0.2);
      const b = this.worldPoint(east, 160, 0.2);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (let north = -160; north <= 160; north += 20) {
      const a = this.worldPoint(-200, north, 0.2);
      const b = this.worldPoint(200, north, 0.2);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8ec8bf, transparent: true, opacity: 0.35 }));
    lines.raycast = () => {};
    this.gridGroup.add(lines);
  }

  buildRuler() {
    const origin = this.worldPoint(0, 0, 0.4);
    const east = this.worldPoint(40, 0, 0.4);
    const north = this.worldPoint(0, 40, 0.4);
    const up = origin.clone();
    up.z += 16;
    const geo = new THREE.BufferGeometry().setFromPoints([origin, east, origin, north, origin, up]);
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xe8f6f2 }));
    lines.raycast = () => {};
    this.rulerGroup.add(lines);
  }

  buildRain() {
    const count = 500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 2] = Math.random() * 36;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xb7d4e2,
      size: 0.45,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  updateForklifts(dt: number) {
    if (!this.forkliftMesh) return;
    const places = forklifts.map((unit, index) => pointAlong(unit.route, this.forkliftProgress[index] || 0));
    forklifts.forEach((unit, index) => {
      let scale = this.forkliftSpeedScale;
      const here = places[index];
      if (!here) return;
      for (let other = 0; other < places.length; other += 1) {
        if (other === index) continue;
        const there = places[other];
        if (there && Math.hypot(here[0] - there[0], here[1] - there[1]) < 8) scale *= 0.25;
      }
      const length = routeLength(unit.route);
      this.forkliftProgress[index] = ((this.forkliftProgress[index] || 0) + unit.speed * scale * dt) % length;
      const pos = pointAlong(unit.route, this.forkliftProgress[index] || 0);
      const ahead = pointAlong(unit.route, (this.forkliftProgress[index] || 0) + 2);
      if (!pos || !ahead) return;
      const position = this.worldPoint(pos[0], pos[1], 0);
      const next = this.worldPoint(ahead[0], ahead[1], 0);
      this.dummy.position.copy(position);
      this.dummy.rotation.set(0, 0, Math.atan2(next.y - position.y, next.x - position.x));
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.forkliftMesh.setMatrixAt(index, this.dummy.matrix);
    });
    this.forkliftMesh.instanceMatrix.needsUpdate = true;
  }

  updateRain(camera: THREE.Camera) {
    if (!this.rain) return;
    this.rain.visible = this.weather === 'rain';
    if (!this.rain.visible) return;
    this.rain.position.set(camera.position.x, camera.position.y, 8);
    const attr = this.rain.geometry.getAttribute('position');
    for (let i = 0; i < attr.count; i += 1) {
      let z = attr.getZ(i) - 0.9;
      if (z < 0) z = 36;
      attr.setZ(i, z);
    }
    attr.needsUpdate = true;
  }

  setWeather(mode: WeatherMode) {
    this.weather = mode;
    if (mode === 'clear') this.scene.fog = null;
    else this.scene.fog = new THREE.FogExp2(mode === 'rain' ? 0x6d7b86 : 0xb7c3c8, mode === 'rain' ? 0.00045 : 0.00028);
    if (this.rain) this.rain.visible = mode === 'rain';
  }

  setPipeGhost(enabled: boolean) {
    this.pipes.forEach((pipe) => {
      const alpha = pipe.material.uniforms.uAlpha;
      if (alpha) alpha.value = enabled ? 0.38 : 1;
      pipe.material.transparent = enabled;
      pipe.material.depthWrite = !enabled;
      pipe.material.needsUpdate = true;
    });
  }

  setFlowBoost(scale: number) {
    this.pipes.forEach((pipe) => {
      const speed = pipe.material.uniforms.uSpeed;
      if (speed) speed.value = pipe.baseSpeed * scale;
    });
  }

  setRuler(visible: boolean) {
    this.rulerGroup.visible = visible;
  }

  syncAlarmLinks(records: AlarmRecord[]) {
    while (this.alarmLinkGroup.children.length) {
      const child = this.alarmLinkGroup.children[0];
      if (!child) break;
      this.alarmLinkGroup.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    if (!this.linkMaterials) {
      this.linkMaterials = {
        info: trackTime(this.timeMaterials, createFlyLineMaterial('#4aa3ff')),
        warning: trackTime(this.timeMaterials, createFlyLineMaterial('#f0b429')),
        urgent: trackTime(this.timeMaterials, createFlyLineMaterial('#ff5a62')),
      };
    }
    const office = buildings.find((building) => building.id === 'O01');
    if (!office) return;
    const end = this.coord.toVector(office.lng, office.lat, 26);
    records.slice(0, 10).forEach((record) => {
      const device = devices.find((item) => item.id === record.deviceId);
      if (!device?.world) return;
      const start = device.world.clone();
      start.z = device.elev + 0.6;
      const mid = new THREE.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, Math.max(start.z, end.z) + 18);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.35, 5, false), this.linkMaterials[record.level]);
      mesh.raycast = () => {};
      this.alarmLinkGroup.add(mesh);
    });
  }

  dispose() {
    [this.baseGroup, this.wallGroup, this.buildingGroup, this.hazardGroup, this.deviceGroup, this.pipeGroup, this.alarmGroup, this.flylineGroup, this.forkliftGroup, this.gridGroup, this.rulerGroup, this.ring, this.rain]
      .forEach((obj) => disposeObject(obj));
  }
}

function routeLength(route: Array<[number, number]>) {
  let sum = 0;
  for (let i = 1; i < route.length; i += 1) {
    const start = route[i - 1];
    const end = route[i];
    if (!start || !end) continue;
    sum += Math.hypot(end[0] - start[0], end[1] - start[1]);
  }
  return Math.max(sum, 0.001);
}

function pointAlong(route: Array<[number, number]>, distance: number): [number, number] | null {
  const first = route[0];
  if (!first) return null;
  let left = distance;
  for (let i = 1; i < route.length; i += 1) {
    const start = route[i - 1];
    const end = route[i];
    if (!start || !end) continue;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (left <= length) {
      const t = length === 0 ? 0 : left / length;
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    }
    left -= length;
  }
  return route[route.length - 1] ?? first;
}

function visibleChain(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}
