import type { LngLat } from './park';

export interface AMapLngLat {
  lng: number;
  lat: number;
  getLng?: () => number;
  getLat?: () => number;
}

export interface AMapPixel {
  x: number;
  y: number;
}

export interface AMapSize {
  width: number;
  height: number;
}

export interface AMapEvent {
  lnglat: AMapLngLat;
  pixel?: AMapPixel;
}

export interface CameraParams {
  near: number;
  far: number;
  fov: number;
  up: [number, number, number];
  lookAt: [number, number, number];
  position: [number, number, number];
}

export interface CustomCoords {
  setCenter(center: LngLat): void;
  lngLatsToCoords(path: LngLat[]): Array<[number, number]>;
  getCameraParams(): CameraParams;
}

export interface AMapOverlay {
  show?: () => void;
  hide?: () => void;
  on?: (event: string, handler: () => void) => void;
  setOptions?: (options: Record<string, unknown>) => void;
  setStyle?: (style: Record<string, string>) => void;
}

export interface OverlayGroup extends AMapOverlay {
  addOverlay(overlay: AMapOverlay): void;
  removeOverlay(overlay: AMapOverlay): void;
}

export interface HeatMapLayer extends AMapOverlay {
  setDataSet(data: { data: Array<{ lng: number; lat: number; count: number }>; max: number }): void;
}

export interface AMapMap {
  customCoords: CustomCoords;
  add(overlay: unknown): void;
  remove(overlay: unknown): void;
  addControl(control: unknown): void;
  on(event: string, handler: (event: AMapEvent) => void): void;
  off(event: string, handler: (event: AMapEvent) => void): void;
  getCenter(): AMapLngLat;
  getZoom(): number;
  getPitch(): number;
  getRotation(): number;
  getSize(): AMapSize;
  setZoom(zoom: number, immediately?: boolean): void;
  setPitch(pitch: number, immediately?: boolean): void;
  setRotation(rotation: number, immediately?: boolean): void;
  setCenter(center: LngLat, immediately?: boolean): void;
  setStatus(status: Record<string, boolean>): void;
  setMapStyle(style: string): void;
  resize(): void;
  render(): void;
  destroy(): void;
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  GLCustomLayer: new (options: {
    zIndex?: number;
    init: (gl: WebGLRenderingContext) => void;
    render: () => void;
  }) => unknown;
  Scale: new (options: { position: string }) => unknown;
  ControlBar: new (options: { position: { right: string; bottom: string } }) => unknown;
  HeatMap: new (map: AMapMap, options: Record<string, unknown>) => HeatMapLayer;
  OverlayGroup: new (overlays?: AMapOverlay[]) => OverlayGroup;
  CircleMarker: new (options: Record<string, unknown>) => AMapOverlay;
  Text: new (options: Record<string, unknown>) => AMapOverlay;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  Polygon: new (options: Record<string, unknown>) => AMapOverlay;
  Pixel: new (x: number, y: number) => unknown;
}
