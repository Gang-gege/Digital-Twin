import { DEVICE_TYPES } from '../mock/parkData';
import type { AlarmLevel, AlarmRecord, Device, ParkStats, Telemetry } from '../types/park';

/**
 * 传感器模拟。没有后端，定时把温度、压力、湿度往阈值上推或拉回。
 * 告警等级完全由读数决定：提示蓝、预警黄、紧急红。离线不进告警列表。
 */
const LIMIT = {
  temperature: [36, 48, 62],
  pressure: [0.45, 0.62, 0.8],
  humidity: [72, 84, 92],
} as const;

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
    this.evaluate();
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
    this.drift();
    const roll = Math.random();
    if (roll < 0.12) this.flipOnline();
    else if (roll < 0.62) this.spike();
    this.evaluate();
    this.emit();
  }

  clearAll() {
    this.devices.forEach((device) => {
      device.status = 'normal';
      device.telemetry.temperature = Math.min(device.telemetry.temperature, 32);
      device.telemetry.pressure = Math.min(device.telemetry.pressure, 0.36);
      device.telemetry.humidity = Math.min(device.telemetry.humidity, 64);
    });
    this.records = [];
    this.emit();
  }

  resetAll() {
    this.devices.forEach((device, index) => {
      device.online = true;
      device.status = 'normal';
      device.telemetry = {
        temperature: 23 + (index % 4),
        pressure: 0.24 + (index % 3) * 0.02,
        humidity: 46 + (index % 6),
        updatedAt: Date.now(),
      };
    });
    this.records = [];
    this.emit();
  }

  getStats(): ParkStats {
    const stats: ParkStats = { total: this.devices.length, online: 0, offline: 0, info: 0, warning: 0, urgent: 0 };
    this.devices.forEach((device) => {
      if (device.online) stats.online += 1;
      else stats.offline += 1;
      if (!device.online || device.status === 'normal') return;
      stats[device.status] += 1;
    });
    return stats;
  }

  getRecords() {
    return this.records.map((record) => ({ ...record }));
  }

  private drift() {
    const now = Date.now();
    this.devices.forEach((device) => {
      const tel = device.telemetry;
      tel.updatedAt = now;
      if (!device.online) return;
      tel.temperature += (26 - tel.temperature) * 0.08 + (Math.random() - 0.5) * 0.6;
      tel.pressure += (0.28 - tel.pressure) * 0.08 + (Math.random() - 0.5) * 0.015;
      tel.humidity += (52 - tel.humidity) * 0.08 + (Math.random() - 0.5) * 1.2;
      clampTelemetry(tel);
    });
  }

  private spike() {
    const pool = this.devices.filter((device) => device.online);
    const device = pool[Math.floor(Math.random() * pool.length)];
    if (!device) return;
    const roll = Math.random();
    if (roll < 0.4) device.telemetry.temperature += 6 + Math.random() * 10;
    else if (roll < 0.7) device.telemetry.pressure += 0.08 + Math.random() * 0.16;
    else device.telemetry.humidity += 6 + Math.random() * 12;
    clampTelemetry(device.telemetry);
  }

  private flipOnline() {
    const offline = this.devices.filter((device) => !device.online);
    if (offline.length && Math.random() < 0.55) {
      const device = offline[Math.floor(Math.random() * offline.length)];
      if (device) device.online = true;
      return;
    }
    const online = this.devices.filter((device) => device.online && device.status === 'normal');
    if (!online.length || offline.length >= 4) return;
    const device = online[Math.floor(Math.random() * online.length)];
    if (device) device.online = false;
  }

  private evaluate() {
    const next: AlarmRecord[] = [];
    this.devices.forEach((device) => {
      if (!device.online) {
        device.status = 'normal';
        return;
      }
      const hit = diagnose(device.telemetry);
      device.status = hit?.level || 'normal';
      if (!hit) return;
      const previous = this.records.find((record) => record.deviceId === device.id);
      next.push({
        id: previous?.id || `AL-${this.seq += 1}`,
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type,
        typeLabel: DEVICE_TYPES[device.type].label,
        level: hit.level,
        message: hit.message,
        time: previous && previous.level === hit.level ? previous.time : Date.now(),
        timeText: formatTime(previous && previous.level === hit.level ? previous.time : Date.now()),
        lng: device.lng,
        lat: device.lat,
      });
    });
    next.sort((a, b) => rank(b.level) - rank(a.level) || b.time - a.time);
    this.records = next.slice(0, 40);
  }

  private emit() {
    this.onChange?.();
  }
}

function diagnose(tel: Telemetry): { level: AlarmLevel; message: string } | null {
  const hits: Array<{ level: AlarmLevel; message: string }> = [];
  const temperature = rankValue(tel.temperature, LIMIT.temperature);
  const pressure = rankValue(tel.pressure, LIMIT.pressure);
  const humidity = rankValue(tel.humidity, LIMIT.humidity);
  if (temperature) hits.push({ level: temperature, message: `温度 ${tel.temperature.toFixed(1)} ℃` });
  if (pressure) hits.push({ level: pressure, message: `压力 ${tel.pressure.toFixed(2)} MPa` });
  if (humidity) hits.push({ level: humidity, message: `湿度 ${tel.humidity.toFixed(0)} %` });
  hits.sort((a, b) => rank(b.level) - rank(a.level));
  return hits[0] || null;
}

function rankValue(value: number, [info, warning, urgent]: readonly [number, number, number]): AlarmLevel | null {
  if (value >= urgent) return 'urgent';
  if (value >= warning) return 'warning';
  if (value >= info) return 'info';
  return null;
}

function rank(level: AlarmLevel) {
  if (level === 'urgent') return 3;
  if (level === 'warning') return 2;
  return 1;
}

function clampTelemetry(tel: Telemetry) {
  tel.temperature = Math.max(8, Math.min(96, tel.temperature));
  tel.pressure = Math.max(0.05, Math.min(1.2, tel.pressure));
  tel.humidity = Math.max(15, Math.min(100, tel.humidity));
}

function formatTime(ts: number) {
  const date = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
