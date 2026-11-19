/**
 * 图层显隐。
 * Three 分组和地图覆盖物都能登记到同一个图层名下，面板只调 setVisible。
 * 建筑 / 设备 / 管网 / 告警是需求里的四层，飞线、热力、测量标注是附加层。
 */
export class LayerManager {
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

  register(name, target) {
    if (!this.targets[name]) this.targets[name] = [];
    this.targets[name].push(target);
    this.apply(name, this.state[name] !== false);
  }

  isVisible(name) {
    return this.state[name] !== false;
  }

  setVisible(name, visible) {
    this.state[name] = visible;
    this.apply(name, visible);
  }

  apply(name, visible) {
    (this.targets[name] || []).forEach((target) => {
      if (target?.isObject3D) {
        target.visible = visible;
        return;
      }
      if (visible) target.show?.();
      else target.hide?.();
    });
  }
}
