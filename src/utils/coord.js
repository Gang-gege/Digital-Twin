import * as THREE from 'three';

/**
 * 坐标工具。
 *
 * 高德底图使用 GCJ-02。三维模型如果用 WGS-84 去对，会整体偏出几十到几百米，
 * 看起来像“模型在飘”。这里分两步把模型和底图锁在同一套坐标上：
 *
 * 1. 业务点位一律用 GCJ-02 经纬度描述，再用等距近似把“米”换算成经纬度，
 *    只用于在园区中心附近布点（几百米范围内误差可以忽略）。
 * 2. 真正交给 Three.js 的平面坐标，必须经过 map.customCoords.lngLatsToCoords。
 *    并且 setCenter 永远钉在园区中心，不要每帧改成 map.getCenter()。
 *    相机参数用 customCoords.getCameraParams() 回写到 Three 相机。
 *    这样模型所在的局部坐标系和地图相机是同一套，缩放、旋转、倾斜都不会漂。
 */

const METERS_PER_DEG_LAT = 111320;

/** 园区中心附近，把东/北方向的米换算成 GCJ-02。 */
export function metersToLngLat(center, east, north) {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLat = north / METERS_PER_DEG_LAT;
  const dLng = east / (METERS_PER_DEG_LAT * Math.cos(latRad));
  return [lng + dLng, lat + dLat];
}

/** GCJ-02 相对园区中心的东、北向米。测距、测面积用这套平面坐标。 */
export function lngLatToMeters(center, lng, lat) {
  const latRad = (center[1] * Math.PI) / 180;
  const north = (lat - center[1]) * METERS_PER_DEG_LAT;
  const east = (lng - center[0]) * METERS_PER_DEG_LAT * Math.cos(latRad);
  return { east, north };
}

/** 从某点沿东、北方向走若干米，得到新的 GCJ-02。第一人称漫游用。 */
export function offsetMeters(lngLat, east, north) {
  return metersToLngLat(lngLat, east, north);
}

export function polylineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return sum;
}

/** 平面多边形面积，单位平方米。顶点为 {east, north}。 */
export function ringArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    sum += points[i].east * points[j].north - points[j].east * points[i].north;
  }
  return Math.abs(sum) / 2;
}

export function formatMeters(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${value.toFixed(1)} m`;
}

export function formatArea(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(2)} 公顷`;
  return `${value.toFixed(1)} ㎡`;
}

/**
 * 高德 customCoords 的薄封装。
 * 所有模型只在初始化时转换一次；渲染循环里只允许 setCenter(固定中心) + 同步相机。
 */
export class CoordTransformer {
  constructor(map, center) {
    this.map = map;
    this.center = center;
    this.customCoords = map.customCoords;
    if (!this.customCoords || typeof this.customCoords.lngLatsToCoords !== 'function') {
      throw new Error('当前地图实例没有 customCoords，请确认使用高德 JS API 2.0 且 viewMode 为 3D');
    }
    this.customCoords.setCenter(center);
    // 官方要求：在第一次 getCameraParams 之前至少做一次经纬度转换，否则镜头参数会报错。
    this.customCoords.lngLatsToCoords([center]);
  }

  /** GCJ-02 -> 与地图相机一致的平面坐标 [东, 北]。 */
  toXY(lng, lat) {
    const pair = this.customCoords.lngLatsToCoords([[lng, lat]])[0];
    return [pair[0], pair[1]];
  }

  /** 加上高度，得到 Three 坐标。本项目约定 Z 轴向上，和官方 GLCustomLayer 示例一致。 */
  toVector(lng, lat, z = 0) {
    const [x, y] = this.toXY(lng, lat);
    return new THREE.Vector3(x, y, z);
  }
}

/**
 * 把高德镜头写进 Three 透视相机。
 * 赋值顺序跟随官方示例：near / far / fov / position / up / lookAt / updateProjectionMatrix。
 * aspect 用地图容器的 CSS 尺寸，避免三维画面被拉变形。
 */
export function syncMapCamera(customCoords, camera, center, aspect) {
  customCoords.setCenter(center);
  const params = customCoords.getCameraParams();
  const { near, far, fov, up, lookAt, position } = params;
  camera.aspect = aspect;
  camera.near = near;
  camera.far = far;
  camera.fov = fov;
  camera.position.set(position[0], position[1], position[2]);
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
