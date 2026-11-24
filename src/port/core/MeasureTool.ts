import type { AMapLngLat, AMapMap, AMapNamespace, AMapOverlay, OverlayGroup } from '../../types/amap';
import type { LngLat, MeasureMode } from '../types/port';
import { formatArea, formatMeters, lngLatToMeters, ringArea } from '../../utils/coord';

/**
 * 测距、区域标注、文字标签。图形留在高德覆盖物组里，单独作为标注图层开关。
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
  declare annotation: string;

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
    this.annotation = '标注';
  }

  setMode(mode: MeasureMode) {
    if (this.mode !== mode) this.discardDraft();
    this.mode = mode;
    this.hint = HINT[mode];
    return this.hint;
  }

  setAnnotation(text: string) {
    this.annotation = text;
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

  addLabel(lnglat: AMapLngLat | LngLat) {
    const point = pair(lnglat);
    const text = this.annotation.trim() || '标注';
    this.keep(this.dot(point));
    this.keep(this.label(point, text, 0, -16));
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
    if (!this.draft.length) return;
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
      bucket.push(this.label(
        [(previous[0] + current[0]) / 2, (previous[1] + current[1]) / 2],
        formatMeters(length),
        0,
        -12,
      ));
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
      const lng = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      bucket.push(this.label([lng, lat], formatArea(ringArea(meters)), 0, -12));
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
    return this.segmentLength(first, point) < 6;
  }

  line(path: LngLat[]) {
    return new this.AMap.Polyline({
      path,
      strokeColor: '#38bdf8',
      strokeWeight: 3,
      strokeOpacity: 0.95,
      zIndex: 180,
      bubble: true,
    });
  }

  polygon(path: LngLat[]) {
    return new this.AMap.Polygon({
      path,
      strokeColor: '#38bdf8',
      strokeWeight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 0.16,
      zIndex: 179,
      bubble: true,
    });
  }

  dot(position: LngLat) {
    return new this.AMap.CircleMarker({
      center: position,
      radius: 4,
      strokeColor: '#e0f2fe',
      strokeWeight: 1,
      fillColor: '#0284c7',
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
        border: '1px solid rgba(56, 189, 248, 0.75)',
        color: '#e0f2fe',
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
  area: '区域：单击加点，靠近起点或双击闭合',
  text: '文字：在底部输入内容，再单击地图放置',
  none: '',
};

function pair(lnglat: AMapLngLat | LngLat): LngLat {
  if (Array.isArray(lnglat)) return [lnglat[0], lnglat[1]];
  return [lnglat.getLng?.() ?? lnglat.lng, lnglat.getLat?.() ?? lnglat.lat];
}
