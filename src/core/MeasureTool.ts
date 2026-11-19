import type { AMapLngLat, AMapMap, AMapNamespace, AMapOverlay, OverlayGroup } from '../types/amap';
import type { LngLat, MeasureMode } from '../types/park';
import { formatArea, formatMeters, lngLatToMeters, ringArea } from '../utils/coord';

/**
 * 测量标注。图形全部放在高德 OverlayGroup 里，不写进建筑/设备网格，
 * 这样“标注图层”可以单独显隐，也不会被三维拾取打中。
 */
export class MeasureTool {
  declare AMap: AMapNamespace;
  declare map: AMapMap;
  declare center: LngLat;
  declare mode: MeasureMode;
  declare draft: LngLat[];
  declare preview: AMapOverlay[];
  declare committed: AMapOverlay[];
  declare group: OverlayGroup;
  declare hint: string;

  constructor({ AMap, map, center }: { AMap: AMapNamespace; map: AMapMap; center: LngLat }) {
    this.AMap = AMap;
    this.map = map;
    this.center = center;
    this.mode = 'none';
    this.draft = [];
    this.preview = [];
    this.committed = [];
    this.group = new AMap.OverlayGroup();
    this.map.add(this.group);
    this.hint = '';
  }

  setMode(mode: MeasureMode) {
    if (this.mode !== mode) this.discardDraft();
    this.mode = mode;
    this.hint = HINT[mode] || '';
    return this.hint;
  }

  addPoint(lnglat: AMapLngLat | LngLat) {
    const point = pair(lnglat);
    if (this.mode === 'area' && this.draft.length >= 3 && this.nearFirst(point)) {
      this.finish();
      return;
    }
    this.draft.push(point);
    this.redrawDraft();
  }

  addElevation(lnglat: AMapLngLat | LngLat, height: number) {
    const point = pair(lnglat);
    this.keep(this.dot(point));
    this.keep(this.label(point, `标高 ${height.toFixed(1)} m`, 0, -16));
  }

  finish() {
    const ok = (this.mode === 'distance' && this.draft.length >= 2)
      || (this.mode === 'area' && this.draft.length >= 3);
    if (!ok) {
      this.discardDraft();
      return;
    }
    this.preview.forEach((item) => this.committed.push(item));
    this.preview = [];
    this.draft = [];
  }

  clear() {
    this.discardDraft();
    this.removeList(this.committed);
    this.committed = [];
  }

  setVisible(visible: boolean) {
    if (visible) this.group.show?.();
    else this.group.hide?.();
  }

  discardDraft() {
    this.removeList(this.preview);
    this.preview = [];
    this.draft = [];
  }

  redrawDraft() {
    this.removeList(this.preview);
    this.preview = [];
    if (this.draft.length === 0) return;
    if (this.mode === 'distance') this.drawDistance(this.draft, this.preview);
    if (this.mode === 'area') this.drawArea(this.draft, this.preview);
  }

  drawDistance(points: LngLat[], bucket: AMapOverlay[]) {
    if (points.length >= 2) bucket.push(this.line(points));
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      if (!previous || !current) continue;
      const length = this.segmentLength(previous, current);
      total += length;
      const mid: LngLat = [(previous[0] + current[0]) / 2, (previous[1] + current[1]) / 2];
      bucket.push(this.label(mid, formatMeters(length), 0, -12));
    }
    const last = points[points.length - 1];
    if (last) bucket.push(this.label(last, `总长 ${formatMeters(total)}`, 12, 8));
    points.forEach((point) => bucket.push(this.dot(point)));
    bucket.forEach((item) => this.group.addOverlay(item));
  }

  drawArea(points: LngLat[], bucket: AMapOverlay[]) {
    if (points.length >= 2) bucket.push(this.line(points));
    if (points.length >= 3) {
      bucket.push(this.polygon(points));
      const meters = points.map(([lng, lat]) => lngLatToMeters(this.center, lng, lat));
      const area = ringArea(meters);
      const lng = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      bucket.push(this.label([lng, lat], formatArea(area), 0, -12));
    }
    points.forEach((point) => bucket.push(this.dot(point)));
    bucket.forEach((item) => this.group.addOverlay(item));
  }

  segmentLength(a: LngLat, b: LngLat) {
    const pa = lngLatToMeters(this.center, a[0], a[1]);
    const pb = lngLatToMeters(this.center, b[0], b[1]);
    return Math.hypot(pa.east - pb.east, pa.north - pb.north);
  }

  nearFirst(point: LngLat) {
    const first = this.draft[0];
    if (!first) return false;
    return this.segmentLength(first, point) < 4;
  }

  line(path: LngLat[]) {
    return new this.AMap.Polyline({
      path,
      strokeColor: '#4c8dff',
      strokeWeight: 3,
      strokeOpacity: 0.95,
      zIndex: 180,
      bubble: true,
    });
  }

  polygon(path: LngLat[]) {
    return new this.AMap.Polygon({
      path,
      strokeColor: '#4c8dff',
      strokeWeight: 2,
      fillColor: '#4c8dff',
      fillOpacity: 0.16,
      zIndex: 179,
      bubble: true,
    });
  }

  dot(position: LngLat) {
    return new this.AMap.CircleMarker({
      center: position,
      radius: 4,
      strokeColor: '#dbeafe',
      strokeWeight: 1,
      fillColor: '#4c8dff',
      fillOpacity: 1,
      zIndex: 181,
      bubble: false,
    });
  }

  label(position: LngLat, text: string, x: number, y: number) {
    return new this.AMap.Text({
      text,
      position,
      offset: new this.AMap.Pixel(x, y),
      zIndex: 182,
      bubble: false,
      style: {
        'background-color': 'rgba(8, 16, 32, 0.9)',
        border: '1px solid rgba(76, 141, 255, 0.75)',
        color: '#e8f1ff',
        'font-size': '12px',
        padding: '2px 6px',
        'border-radius': '2px',
        'white-space': 'nowrap',
      },
    });
  }

  keep(overlay: AMapOverlay) {
    this.committed.push(overlay);
    this.group.addOverlay(overlay);
  }

  removeList(list: AMapOverlay[]) {
    list.forEach((overlay) => {
      try {
        this.group.removeOverlay(overlay);
      } catch {
        /* 覆盖物可能已经不在组里 */
      }
      this.map.remove(overlay);
    });
  }
}

const HINT: Record<MeasureMode, string> = {
  distance: '测距：单击加点，双击或右键结束',
  area: '测面积：单击加点，靠近起点或双击闭合',
  elevation: '标高：单击建筑、设备或地面放置标注',
  none: '',
};

function pair(lnglat: AMapLngLat | LngLat): LngLat {
  if (Array.isArray(lnglat)) return [lnglat[0], lnglat[1]];
  return [lnglat.getLng?.() ?? lnglat.lng, lnglat.getLat?.() ?? lnglat.lat];
}
