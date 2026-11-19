import { alarmText, DEVICE_TYPES } from '../mock/parkData';
import type { AlarmLevel, AlarmRecord, Device, DeviceStatus, ParkStats } from '../types/park';
import { statusKey } from '../utils/present';

/**
 * 告警模拟。没有后端，用定时器随机升降设备状态。
 * 正常绿、预警黄、告警红；离线单独统计，不进入告警列表。
 */
export class AlarmManager {
  declare devices: Device[];
  declare onChange: (() => void) | undefined;
  declare records: AlarmRecord[];
  declare seq: number;
  declare timer: number;

  constructor(devices: Device[], onChange?: () => void) {
    this.devices = devices;
    this.onChange = onChange;
    this.records = [];
    this.seq = 100;
    this.timer = 0;
    devices.forEach((device) => {
      if (device.status === 'warning' || device.status === 'alarm') {
        this.records.unshift(this.makeRecord(device, device.status, alarmText(device.type, device.status)));
      }
    });
  }

  start(interval = 2600) {
    this.stop();
    this.timer = window.setInterval(() => this.tick(), interval);
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  tick() {
    this.jitter();
    const roll = Math.random();
    const active = this.activeCount();
    if (roll < 0.12) this.flipOnline();
    if (roll < 0.55 && active < 8) this.raiseOne();
    else if (roll < 0.78) this.escalateOne();
    else this.recoverOne();
    this.emit();
  }

  /** 清空告警，离线设备保持离线。 */
  clearAll() {
    this.devices.forEach((device) => {
      if (device.status === 'warning' || device.status === 'alarm') device.status = 'normal';
    });
    this.records = [];
    this.emit();
  }

  /** 全部恢复在线、正常，并重置一份温和的遥测。 */
  resetAll() {
    this.devices.forEach((device) => {
      device.online = true;
      device.status = 'normal';
      device.telemetry.temperature = 21 + Math.random() * 4;
      device.telemetry.updatedAt = Date.now();
    });
    this.records = [];
    this.emit();
  }

  getStats(): ParkStats {
    const stats = { total: this.devices.length, online: 0, offline: 0, warning: 0, alarm: 0 };
    this.devices.forEach((device) => {
      if (device.online) stats.online += 1;
      else stats.offline += 1;
      if (device.online && device.status === 'warning') stats.warning += 1;
      if (device.online && device.status === 'alarm') stats.alarm += 1;
    });
    return stats;
  }

  getRecords() {
    return this.records.map((record) => ({ ...record }));
  }

  jitter() {
    const now = Date.now();
    this.devices.forEach((device) => {
      const tel = device.telemetry;
      tel.updatedAt = now;
      if (!device.online) return;
      const drift = (Math.random() - 0.48) * (device.type === 'charger' ? 6 : 1.2);
      tel.value = Math.max(0, tel.value + drift);
      if (device.status === 'alarm') tel.temperature = Math.min(96, tel.temperature + 0.8);
      else if (device.status === 'warning') tel.temperature = Math.min(72, tel.temperature + 0.25);
      else tel.temperature += (24 - tel.temperature) * 0.08 + (Math.random() - 0.5) * 0.3;
    });
  }

  raiseOne() {
    const pool = this.devices.filter((device) => device.online && device.status === 'normal');
    if (!pool.length) return;
    const device = pool[Math.floor(Math.random() * pool.length)];
    if (!device) return;
    const level: AlarmLevel = Math.random() < 0.35 ? 'alarm' : 'warning';
    device.status = level;
    if (level === 'alarm') device.telemetry.temperature = Math.max(device.telemetry.temperature, 68);
    this.upsert(device, level, alarmText(device.type, level));
  }

  escalateOne() {
    const device = this.pickStatus('warning');
    if (!device) {
      this.raiseOne();
      return;
    }
    device.status = 'alarm';
    device.telemetry.temperature = Math.max(device.telemetry.temperature, 70);
    this.upsert(device, 'alarm', alarmText(device.type, 'alarm'));
  }

  recoverOne() {
    const device = this.pickStatus('alarm') || this.pickStatus('warning');
    if (!device) return;
    if (device.status === 'alarm') {
      device.status = 'warning';
      this.upsert(device, 'warning', alarmText(device.type, 'warning'));
      return;
    }
    device.status = 'normal';
    this.records = this.records.filter((record) => record.deviceId !== device.id);
  }

  flipOnline() {
    const offline = this.devices.filter((device) => !device.online);
    if (offline.length && Math.random() < 0.6) {
      const device = offline[Math.floor(Math.random() * offline.length)];
      if (!device) return;
      device.online = true;
      device.status = 'normal';
      return;
    }
    const online = this.devices.filter((device) => device.online && device.status === 'normal');
    if (!online.length || offline.length >= 4) return;
    const device = online[Math.floor(Math.random() * online.length)];
    if (!device) return;
    device.online = false;
    device.status = 'normal';
    this.records = this.records.filter((record) => record.deviceId !== device.id);
  }

  pickStatus(status: DeviceStatus) {
    const pool = this.devices.filter((device) => device.online && device.status === status);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  activeCount() {
    return this.devices.filter((device) => device.online && device.status !== 'normal').length;
  }

  upsert(device: Device, level: AlarmLevel, message: string) {
    const found = this.records.find((record) => record.deviceId === device.id);
    if (found) {
      found.level = level;
      found.message = message;
      found.time = Date.now();
      found.timeText = formatTime(found.time);
      found.badge = statusKey(device);
      return;
    }
    this.records.unshift(this.makeRecord(device, level, message));
    if (this.records.length > 40) this.records.pop();
  }

  makeRecord(device: Device, level: AlarmLevel, message: string): AlarmRecord {
    const time = Date.now();
    return {
      id: `AL-${this.seq += 1}`,
      deviceId: device.id,
      deviceName: device.name,
      typeLabel: DEVICE_TYPES[device.type].label,
      level,
      message,
      time,
      timeText: formatTime(time),
      lng: device.lng,
      lat: device.lat,
    };
  }

  emit() {
    this.onChange?.();
  }
}

function formatTime(ts: number) {
  const date = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
