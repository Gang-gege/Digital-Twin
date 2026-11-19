import { offsetMeters } from '../utils/coord.js';

/**
 * 视角控制：预设飞行、复位、自动环视、第一人称巡检。
 * 相机始终交给高德，Three 只在每帧读取镜头，因此漫游时底图和白模仍然贴在一起。
 *
 * 高德 rotation：正北为 0，地图顺时针转动。
 * 屏幕向上的地理方位是 -rotation，所以前进量是东 = -sin(rotation)，北 = cos(rotation)。
 */
export class CameraController {
  constructor(map, dom) {
    this.map = map;
    this.dom = dom;
    this.keys = new Set();
    this.mode = 'free';
    this.flying = false;
    this.userHolding = false;
    this.holdOffUntil = 0;
    this.lookDrag = false;
    this.lastX = 0;
    this.lastY = 0;
    this.flyRaf = 0;
    this.onModeExit = null;
    this.bind();
  }

  bind() {
    this.onKeyDown = (event) => {
      if (isTyping(event)) return;
      this.keys.add(event.code);
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onBlur = () => {
      this.keys.clear();
      this.lookDrag = false;
      this.userHolding = false;
    };
    this.onMouseDown = (event) => {
      if (this.mode !== 'fps' || event.button !== 0) return;
      this.lookDrag = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    };
    this.onMouseUp = () => {
      this.lookDrag = false;
    };
    this.onMouseMove = (event) => this.look(event);
    this.onLockChange = () => {
      if (this.mode === 'fps' && document.pointerLockElement !== this.dom) {
        this.onModeExit?.();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  dispose() {
    this.cancelFly();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.dom.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  snapshot() {
    const center = this.map.getCenter();
    return {
      center: [center.lng, center.lat],
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      rotation: this.map.getRotation(),
    };
  }

  apply(state) {
    this.map.setZoom(state.zoom, true);
    this.map.setPitch(clamp(state.pitch, 0, 80), true);
    this.map.setRotation(norm(state.rotation), true);
    this.map.setCenter(state.center, true);
  }

  flyTo(target, duration = 1000) {
    this.cancelFly();
    const from = this.snapshot();
    const to = {
      center: target.center,
      zoom: target.zoom,
      pitch: target.pitch,
      rotation: target.rotation,
    };
    const start = performance.now();
    this.flying = true;
    const step = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const k = raw * raw * (3 - 2 * raw);
      this.apply({
        center: [
          from.center[0] + (to.center[0] - from.center[0]) * k,
          from.center[1] + (to.center[1] - from.center[1]) * k,
        ],
        zoom: from.zoom + (to.zoom - from.zoom) * k,
        pitch: from.pitch + (to.pitch - from.pitch) * k,
        rotation: lerpAngle(from.rotation, to.rotation, k),
      });
      if (raw < 1) this.flyRaf = requestAnimationFrame(step);
      else this.flying = false;
    };
    this.flyRaf = requestAnimationFrame(step);
  }

  cancelFly() {
    if (this.flyRaf) cancelAnimationFrame(this.flyRaf);
    this.flyRaf = 0;
    this.flying = false;
  }

  setMode(mode) {
    this.mode = mode;
    this.keys.clear();
    if (mode === 'fps') {
      this.cancelFly();
      this.dom.requestPointerLock?.();
      return;
    }
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  /** 鼠标按下时暂停环视，避免和用户拖拽抢镜头。 */
  hold(active) {
    this.userHolding = active;
    if (!active) this.holdOffUntil = performance.now() + 1200;
  }

  blocked() {
    return this.userHolding || this.flying || performance.now() < this.holdOffUntil;
  }

  /**
   * @param {number} dt 秒
   * @param {boolean} autoRotate 是否环视
   */
  update(dt, autoRotate) {
    if (autoRotate && this.mode === 'free' && !this.blocked()) {
      this.map.setRotation(norm(this.map.getRotation() + 6 * dt), true);
    }
    if (this.mode !== 'fps' || this.flying) return;
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW')) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    if (this.keys.has('KeyA')) strafe -= 1;
    if (!forward && !strafe) return;
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = (sprint ? 78 : 32) * dt;
    const rad = (this.map.getRotation() * Math.PI) / 180;
    const east = (-Math.sin(rad) * forward + Math.cos(rad) * strafe) * speed;
    const north = (Math.cos(rad) * forward + Math.sin(rad) * strafe) * speed;
    const center = this.map.getCenter();
    this.map.setCenter(offsetMeters([center.lng, center.lat], east, north), true);
  }

  look(event) {
    if (this.mode !== 'fps') return;
    const locked = document.pointerLockElement === this.dom;
    if (!locked && !this.lookDrag) return;
    const dx = locked ? event.movementX : event.clientX - this.lastX;
    const dy = locked ? event.movementY : event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (!dx && !dy) return;
    const rotation = this.map.getRotation() - dx * 0.16;
    const pitch = clamp(this.map.getPitch() - dy * 0.08, 8, 76);
    this.map.setRotation(norm(rotation), true);
    this.map.setPitch(pitch, true);
  }
}

function isTyping(event) {
  const tag = event.target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function norm(angle) {
  return ((angle % 360) + 360) % 360;
}

function lerpAngle(from, to, t) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * t;
}
