import type { Object3D } from 'three';
import type { LayerName, LayerState } from '../types/port';

type LayerTarget = Object3D | { show?: () => void; hide?: () => void };

/** 岸桥、集装箱、集卡、道路标线、告警，以及飞线、轨迹、水面、设施、标注。 */
export class LayerManager {
  declare state: LayerState;
  declare targets: Partial<Record<LayerName, LayerTarget[]>>;

  constructor() {
    this.state = {
      crane: true,
      container: true,
      truck: true,
      road: true,
      alarm: true,
      flow: true,
      trail: true,
      water: true,
      facility: true,
      measure: true,
    };
    this.targets = {};
  }

  register(name: LayerName, target: LayerTarget) {
    const bucket = this.targets[name] || [];
    bucket.push(target);
    this.targets[name] = bucket;
    this.apply(name, this.state[name]);
  }

  isVisible(name: LayerName) {
    return this.state[name];
  }

  setVisible(name: LayerName, visible: boolean) {
    this.state[name] = visible;
    this.apply(name, visible);
  }

  apply(name: LayerName, visible: boolean) {
    (this.targets[name] || []).forEach((target) => {
      if (isObject3D(target)) {
        target.visible = visible;
        return;
      }
      if (visible) target.show?.();
      else target.hide?.();
    });
  }
}

function isObject3D(target: LayerTarget): target is Object3D {
  return 'isObject3D' in target && Boolean(target.isObject3D);
}
