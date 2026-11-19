import type { Object3D } from 'three';
import type { LayerName, LayerState } from '../types/park';

type LayerTarget = Object3D | { show?: () => void; hide?: () => void };

/**
 * 图层显隐。
 * Three 分组和地图覆盖物都能登记到同一个图层名下，面板只调 setVisible。
 * 建筑 / 设备 / 管网 / 告警是需求里的四层，飞线、热力、测量标注是附加层。
 */
export class LayerManager {
  declare state: LayerState;
  declare targets: Partial<Record<LayerName, LayerTarget[]>>;

  constructor() {
    this.state = {
      building: true,
      device: true,
      pipe: true,
      alarm: true,
      flyline: true,
      heat: false,
      measure: true,
    };
    this.targets = {};
  }

  register(name: LayerName, target: LayerTarget) {
    const bucket = this.targets[name] || [];
    bucket.push(target);
    this.targets[name] = bucket;
    this.apply(name, this.state[name] !== false);
  }

  isVisible(name: LayerName) {
    return this.state[name] !== false;
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
