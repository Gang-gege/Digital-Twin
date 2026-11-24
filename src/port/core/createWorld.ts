import * as THREE from 'three';
import { metersToLngLat } from '../../utils/coord';
import type { CoordTransformer } from '../../utils/coord';
import { AlarmManager } from './AlarmManager';
import { CraneAnimator, type CraneRig } from './CraneAnimator';
import { DispatchSimulator } from './DispatchSimulator';
import { EffectLayer, cullBlocks, type FlowChain } from './effects';
import { TruckSimulator } from './TruckSimulator';
import {
  BOX_STATUS,
  PORT_CENTER,
  berths,
  blockCapacity,
  blockCenter,
  blocks,
  buildContainers,
  buildTrucks,
  cranes,
  facilities,
  lanes,
} from '../mock/portData';
import { createAlarmMaterial, createWaterMaterial, sharedTime } from '../shaders/materials';
import type {
  AlarmRecord,
  BlockStat,
  ContainerUnit,
  CraneUnit,
  FacilityUnit,
  PortStats,
  TimeMode,
  TruckUnit,
} from '../types/port';
import {
  buildCraneParts,
  buildFlood,
  buildGate,
  buildShip,
  createBulbGeometry,
  createCameraGeometry,
  createContainerGeometry,
  createLampGeometry,
  createTruckGeometry,
  createWeighGeometry,
} from '../utils/render';

interface BlockMesh {
  id: string;
  mesh: THREE.InstancedMesh;
  items: ContainerUnit[];
  sphere: THREE.Sphere;
}

/**
 * 码头三维内容。
 * 所有贴地坐标都经 CoordTransformer：GCJ-02 → 高德局部坐标，中心钉死，模型不跟地图中心漂。
 */
export class PortWorld {
  declare scene: THREE.Scene;
  declare coord: CoordTransformer;
  declare craneGroup: THREE.Group;
  declare containerGroup: THREE.Group;
  declare truckGroup: THREE.Group;
  declare roadGroup: THREE.Group;
  declare alarmGroup: THREE.Group;
  declare flowGroup: THREE.Group;
  declare trailGroup: THREE.Group;
  declare waterGroup: THREE.Group;
  declare facilityGroup: THREE.Group;
  declare containers: ContainerUnit[];
  declare craneUnits: CraneUnit[];
  declare truckUnits: TruckUnit[];
  declare facilityUnits: FacilityUnit[];
  declare blocks: BlockMesh[];
  declare animator: CraneAnimator;
  declare trucks: TruckSimulator;
  declare dispatch: DispatchSimulator;
  declare alarms: AlarmManager;
  declare effects: EffectLayer;
  declare selected: Set<string>;
  declare dummy: THREE.Object3D;
  declare tmp: THREE.Vector3;
  declare night: boolean;
  declare ambient: THREE.AmbientLight;
  declare sun: THREE.DirectionalLight;
  declare bulbMat: THREE.MeshPhongMaterial;
  declare nightMat: THREE.MeshPhongMaterial;
  declare floods: THREE.Object3D[];
  declare glows: THREE.Mesh[];
  declare truckMesh: THREE.InstancedMesh;
  declare cameraMesh: THREE.InstancedMesh;
  declare weighMesh: THREE.InstancedMesh;
  declare chainA: { ship: THREE.Vector3; box: THREE.Vector3 };
  declare chainB: { ship: THREE.Vector3; box: THREE.Vector3 };
  declare culledText: string;

  constructor(scene: THREE.Scene, coord: CoordTransformer) {
    this.scene = scene;
    this.coord = coord;
    this.containers = buildContainers();
    this.craneUnits = cranes;
    this.truckUnits = buildTrucks();
    this.facilityUnits = facilities;
    this.blocks = [];
    this.animator = new CraneAnimator();
    this.alarms = new AlarmManager();
    this.selected = new Set();
    this.dummy = new THREE.Object3D();
    this.tmp = new THREE.Vector3();
    this.night = false;
    this.floods = [];
    this.glows = [];
    this.culledText = '箱区在视锥内';

    this.craneGroup = group('cranes');
    this.containerGroup = group('containers');
    this.truckGroup = group('trucks');
    this.roadGroup = group('roads');
    this.alarmGroup = group('alarms');
    this.flowGroup = group('flow');
    this.trailGroup = group('trails');
    this.waterGroup = group('water');
    this.facilityGroup = group('facility');
    scene.add(
      this.waterGroup,
      this.roadGroup,
      this.facilityGroup,
      this.containerGroup,
      this.craneGroup,
      this.truckGroup,
      this.flowGroup,
      this.trailGroup,
      this.alarmGroup,
    );

    this.ambient = new THREE.AmbientLight(0xd6e4f0, 0.72);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.set(280, -180, 520);
    scene.add(this.ambient, this.sun, new THREE.HemisphereLight(0xc5d8ea, 0x1c2836, 0.45));
    this.bulbMat = new THREE.MeshPhongMaterial({ color: 0x94a3b8, emissive: 0x000000 });
    this.nightMat = new THREE.MeshPhongMaterial({ color: 0xf4b942, emissive: 0x000000 });

    this.buildGround();
    this.buildContainers();
    this.buildCranes();
    this.buildTrucks();
    this.buildFacilities();
    this.buildGlows();
    this.effects = new EffectLayer(this.flowGroup, this.trailGroup, this.roadGroup, (e, n, z) => this.at(e, n, z));
    const blockA = blocks[0];
    const blockB = blocks[1];
    const berthA = berths[0];
    const berthB = berths[1];
    const centerA = blockA ? blockCenter(blockA) : { east: -200, north: 100 };
    const centerB = blockB ? blockCenter(blockB) : { east: -70, north: 100 };
    this.chainA = {
      ship: this.at(berthA?.east ?? -190, -36, 10),
      box: this.at(centerA.east, centerA.north, 8),
    };
    this.chainB = {
      ship: this.at(berthB?.east ?? 20, -36, 10),
      box: this.at(centerB.east, centerB.north, 8),
    };
    this.dispatch = new DispatchSimulator(this.containers, this.craneUnits, this.animator);
    this.dispatch.onChange = () => this.repaintContainers();
    this.trucks = new TruckSimulator(this.truckUnits, this.truckMesh, (east, north, z) => this.at(east, north, z));
  }

  /** 东/北向的米先变 GCJ-02，再变成和地图相机同一套的局部坐标。 */
  at(east: number, north: number, z = 0) {
    const [lng, lat] = metersToLngLat(PORT_CENTER, east, north);
    return this.coord.toVector(lng, lat, z);
  }

  update(simDt: number, realTime: number, camera: THREE.PerspectiveCamera) {
    sharedTime.value = realTime;
    this.trucks.selected = this.selected;
    this.trucks.update(simDt);
    this.animator.update(simDt);
    this.dispatch.update(simDt);
    this.touchFacilities();
    const fault = this.alarms.update(simDt, {
      fault: false,
      gateQueue: this.trucks.gateQueue(),
      blocks: this.blockStats(),
      lanes: this.trucks.heat(lanes),
      cranes: this.craneUnits,
    });
    this.animator.setFault('QC-03', fault);
    this.syncCraneLng();
    this.syncGlows();
    this.effects.update(realTime, this.flowChains(), this.trucks.units.map((item) => item.history), this.trucks.heat(lanes).map((item) => item.count));
    if (this.containerGroup.visible) {
      const hidden = cullBlocks(camera, this.blocks);
      this.culledText = hidden ? `${hidden} 个箱区在视锥外` : '箱区在视锥内';
    }
  }

  stats(): PortStats {
    const blockList = this.blockStats();
    const yardBoxes = blockList.reduce((sum, block) => sum + block.count, 0);
    const yardCapacity = blockList.reduce((sum, block) => sum + block.capacity, 0);
    const busy = new Set(this.craneUnits.filter((crane) => crane.status === 'working').map((crane) => crane.berthId));
    const info = this.alarms.records.filter((item) => item.level === 'info').length;
    const warning = this.alarms.records.filter((item) => item.level === 'warning').length;
    const urgent = this.alarms.records.filter((item) => item.level === 'urgent').length;
    return {
      berthRate: busy.size / berths.length,
      berthText: `在泊 ${berths.length}/3 · 作业 ${busy.size}`,
      yardBoxes,
      yardCapacity,
      trucksInPort: this.truckUnits.length,
      trucksMoving: this.truckUnits.filter((truck) => truck.state === 'run').length,
      pendingJobs: this.dispatch.queue.length,
      info,
      warning,
      urgent,
      blocks: blockList,
    };
  }

  alarmList(): AlarmRecord[] {
    return this.alarms.records;
  }

  blockStats(): BlockStat[] {
    return blocks.map((block) => {
      const items = this.containers.filter((box) => box.blockId === block.id);
      const count = items.filter((box) => !box.hidden).length;
      const capacity = blockCapacity(block);
      const center = blockCenter(block);
      return {
        id: block.id,
        name: block.name,
        count,
        capacity,
        rate: capacity ? count / capacity : 0,
        east: center.east,
        north: center.north,
      };
    });
  }

  setTimeOfDay(mode: TimeMode) {
    this.night = mode === 'night';
    this.ambient.intensity = this.night ? 0.22 : 0.72;
    this.sun.intensity = this.night ? 0.12 : 0.9;
    this.bulbMat.emissive.set(this.night ? 0xffd27a : 0x000000);
    this.nightMat.emissive.set(this.night ? 0xffb020 : 0x000000);
    this.floods.forEach((flood) => {
      flood.visible = this.night;
    });
  }

  highlight(ids: string[]) {
    this.selected = new Set(ids);
    this.animator.rigs.forEach((rig) => {
      rig.ring.visible = this.selected.has(rig.id);
    });
    this.repaintContainers();
  }

  reset() {
    this.animator.reset();
    this.dispatch.reset();
    this.trucks.reset();
    this.alarms.reset();
    this.repaintContainers();
  }

  getPickables() {
    return [
      ...this.blocks.map((block) => block.mesh),
      this.truckMesh,
      this.craneGroup,
      this.weighMesh,
      this.cameraMesh,
      this.facilityGroup,
    ];
  }

  containerById(id: string) {
    return this.containers.find((box) => box.id === id);
  }

  repaintContainers() {
    const color = new THREE.Color();
    this.blocks.forEach((block) => {
      block.items.forEach((box, index) => {
        const position = this.at(box.x, box.y, box.z);
        box.wx = position.x;
        box.wy = position.y;
        box.wz = position.z;
        this.dummy.position.copy(position);
        this.dummy.rotation.set(0, 0, 0);
        if (box.hidden) this.dummy.scale.set(0, 0, 0);
        else this.dummy.scale.set(box.boxType === '20GP' ? 0.5 : 1, 1, box.boxType === '40HC' ? 1.12 : 1);
        this.dummy.updateMatrix();
        block.mesh.setMatrixAt(index, this.dummy.matrix);
        color.set(this.selected.has(box.id) ? '#ffe08a' : BOX_STATUS[box.status].color);
        block.mesh.setColorAt(index, color);
      });
      block.mesh.instanceMatrix.needsUpdate = true;
      if (block.mesh.instanceColor) block.mesh.instanceColor.needsUpdate = true;
      block.mesh.computeBoundingSphere();
    });
  }

  dispose() {
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose?.();
    });
  }

  buildGround() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(680, 200), createWaterMaterial());
    water.position.copy(this.at(0, -110, 0.15));
    water.frustumCulled = false;
    this.waterGroup.add(water);

    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 70),
      new THREE.MeshPhongMaterial({ color: 0x1e293b, transparent: true, opacity: 0.55 }),
    );
    apron.position.copy(this.at(0, 28, 0.08));
    this.roadGroup.add(apron);
    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 70),
      new THREE.MeshPhongMaterial({ color: 0x243044, transparent: true, opacity: 0.42 }),
    );
    yard.position.copy(this.at(0, 108, 0.08));
    this.roadGroup.add(yard);

    berths.forEach((berth) => {
      const ship = buildShip();
      ship.position.copy(this.at(berth.east, berth.north, 0));
      this.facilityGroup.add(ship);
    });
    const gate = buildGate();
    gate.position.copy(this.at(0, 258, 0));
    this.facilityGroup.add(gate);

    this.addDashed([[-250, 40], [250, 40]], 0xf8fafc);
    this.addDashed([[-250, 76], [250, 76]], 0xfde68a);
    this.addDashed([[0, 70], [0, 262]], 0xe2e8f0);
    this.addDashed([[16, 40], [16, 262]], 0xe2e8f0);
  }

  addDashed(points: Array<[number, number]>, color: number) {
    const vectors = points.map(([east, north]) => this.at(east, north, 0.55));
    const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
    const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, dashSize: 4, gapSize: 3 }));
    line.computeLineDistances();
    this.roadGroup.add(line);
  }

  buildContainers() {
    const geometry = createContainerGeometry();
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    blocks.forEach((block) => {
      const items = this.containers.filter((box) => box.blockId === block.id);
      items.forEach((box, index) => {
        box.instanceIndex = index;
      });
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      mesh.userData = { pickType: 'container', items };
      mesh.frustumCulled = false;
      this.containerGroup.add(mesh);
      const center = blockCenter(block);
      const sphere = new THREE.Sphere(
        this.at(center.east, center.north, 8),
        Math.hypot(block.bays * block.bayPitch, block.rows * block.rowPitch) * 0.55 + 16,
      );
      this.blocks.push({ id: block.id, mesh, items, sphere });
    });
    this.repaintContainers();
  }

  buildCranes() {
    const steel = new THREE.MeshPhongMaterial({ color: 0xf4b942 });
    this.craneUnits.forEach((unit) => {
      const parts = buildCraneParts(unit.id, steel);
      const anchor = this.at(unit.homeEast, unit.homeNorth, 0);
      const rig: CraneRig = { ...parts, id: unit.id, unit, anchor, gantry: 0, fault: false, job: null };
      this.craneGroup.add(parts.group);
      this.animator.add(rig);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 0.4), this.nightMat);
      lamp.position.set(0, -30, 37);
      parts.group.add(lamp);
    });
  }

  buildTrucks() {
    this.truckMesh = new THREE.InstancedMesh(
      createTruckGeometry(),
      new THREE.MeshPhongMaterial({ color: 0xffffff }),
      this.truckUnits.length,
    );
    this.truckMesh.userData = { pickType: 'truck', items: this.truckUnits };
    this.truckMesh.frustumCulled = false;
    this.truckGroup.add(this.truckMesh);
  }

  buildFacilities() {
    const cameras = this.facilityUnits.filter((item) => item.kind === 'camera');
    const lamps = this.facilityUnits.filter((item) => item.kind === 'lamp');
    const weighs = this.facilityUnits.filter((item) => item.kind === 'weigh');
    this.cameraMesh = this.scatter(createCameraGeometry(), cameras, 0xb6c2d1, 'camera');
    this.weighMesh = this.scatter(createWeighGeometry(), weighs, 0xd6dee8, 'weigh');
    this.scatter(createLampGeometry(), lamps, 0x94a3b8, 'lamp');
    const bulbs = new THREE.InstancedMesh(createBulbGeometry(), this.bulbMat, lamps.length);
    bulbs.frustumCulled = false;
    lamps.forEach((lamp, index) => {
      this.dummy.position.copy(this.at(lamp.east, lamp.north, 0));
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      bulbs.setMatrixAt(index, this.dummy.matrix);
    });
    bulbs.instanceMatrix.needsUpdate = true;
    this.facilityGroup.add(bulbs);
    [[-180, 150], [-40, 150], [90, 150], [210, 150], [-190, 30], [200, 30]].forEach(([east, north]) => {
      const flood = buildFlood();
      flood.raycast = () => undefined;
      flood.position.copy(this.at(east || 0, north || 0, 22));
      flood.visible = false;
      this.facilityGroup.add(flood);
      this.floods.push(flood);
    });
  }

  scatter(geometry: THREE.BufferGeometry, items: FacilityUnit[], color: number, pickType: string) {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshPhongMaterial({ color }),
      Math.max(1, items.length),
    );
    mesh.userData = { pickType, items };
    mesh.frustumCulled = false;
    items.forEach((item, index) => {
      this.dummy.position.copy(this.at(item.east, item.north, 0));
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.facilityGroup.add(mesh);
    return mesh;
  }

  buildGlows() {
    const speeds = [7, 4.2, 2.4, 4.2];
    const colors = ['#ff5a62', '#f0b429', '#4aa3ff', '#f0b429'];
    for (let i = 0; i < 4; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(7, 16, 12),
        createAlarmMaterial(colors[i] || '#ff5a62', speeds[i] || 4),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.alarmGroup.add(mesh);
      this.glows.push(mesh);
    }
  }

  syncGlows() {
    this.glows.forEach((mesh, index) => {
      const alarm = this.alarms.records[index];
      if (!alarm) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.copy(this.at(alarm.east, alarm.north, 8));
      const material = mesh.material as THREE.ShaderMaterial;
      material.uniforms.uColor?.value.set(alarm.level === 'urgent' ? '#ff5a62' : alarm.level === 'warning' ? '#f0b429' : '#4aa3ff');
      material.uniforms.uSpeed.value = alarm.level === 'urgent' ? 7 : alarm.level === 'warning' ? 4.2 : 2.4;
    });
  }

  syncCraneLng() {
    this.craneUnits.forEach((crane) => {
      const [lng, lat] = metersToLngLat(PORT_CENTER, crane.east, crane.north);
      crane.lng = lng;
      crane.lat = lat;
    });
  }

  touchFacilities() {
    this.facilityUnits.filter((item) => item.kind === 'weigh').forEach((weigh) => {
      const near = this.truckUnits.some((truck) => Math.hypot(truck.east - weigh.east, truck.north - weigh.north) < 16);
      weigh.task = near ? '集卡过磅' : '空闲';
      weigh.status = near ? '作业中' : '正常';
    });
    const queue = this.trucks.gateQueue();
    const gate = this.facilityUnits.find((item) => item.kind === 'gate');
    if (gate) {
      gate.task = queue ? `排队 ${queue} 辆` : '进港验放';
      gate.status = queue >= 2 ? '排队' : '开放';
    }
  }

  flowChains(): FlowChain[] {
    const first = this.animator.rigs[0];
    const second = this.animator.rigs[1];
    const truckA = this.trucks.units[0];
    const truckB = this.trucks.units[8];
    return [
      chain(first, this.chainA, truckA, this.tmp),
      chain(second, this.chainB, truckB, this.tmp),
    ];
  }
}

function group(name: string) {
  const item = new THREE.Group();
  item.name = name;
  return item;
}

function chain(
  rig: CraneRig | undefined,
  fixed: { ship: THREE.Vector3; box: THREE.Vector3 },
  truck: { history: Array<{ x: number; y: number; z: number }> } | undefined,
  tmp: THREE.Vector3,
): FlowChain {
  const crane = rig ? rig.spreader.getWorldPosition(tmp.clone()) : fixed.ship.clone();
  const last = truck?.history[truck.history.length - 1];
  const truckPoint = last ? new THREE.Vector3(last.x, last.y, last.z + 4) : fixed.box.clone();
  return { ship: fixed.ship, crane, box: fixed.box, truck: truckPoint };
}
