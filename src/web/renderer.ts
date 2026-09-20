import { wheels } from '../core/chassis';
import type { Chassis } from '../core/chassis';
import { bounds, localToWorld } from '../core/geometry';
import type { Point, Pose } from '../core/geometry';

export interface ViewOptions { zoom: number; labels: boolean; dimensions: boolean; grid: boolean }
const format = (n: number) => Number(n.toFixed(3)).toString();

/** Geometry stays in mm. This camera maps world +Y upward onto Canvas's downwards y. */
export function renderChassis(canvas: HTMLCanvasElement, chassis: Chassis, pose: Pose, options: ViewOptions): void {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fafcfc'; ctx.fillRect(0, 0, width, height);
  const wheelShapes = wheels(chassis);
  const extents = bounds([
    ...chassis.collision.outline_xy_mm,
    ...wheelShapes.flatMap(w => w.outline),
    ...chassis.sensors.positions.map(s => [s.x_mm, s.y_mm] as Point),
  ].map(p => localToWorld(p, pose)));
  const scale = Math.min((width - 132) / (extents.maxX - extents.minX), (height - 140) / (extents.maxY - extents.minY)) * options.zoom;
  const center: Point = [(extents.maxX + extents.minX) / 2, (extents.maxY + extents.minY) / 2];
  const screen = ([x, y]: Point): Point => [width / 2 + (x - center[0]) * scale, height / 2 - (y - center[1]) * scale];
  const local = (p: Point) => screen(localToWorld(p, pose));
  const path = (points: readonly Point[], closed = false) => {
    ctx.beginPath();
    points.forEach((p, i) => { const s = local(p); if (i) ctx.lineTo(...s); else ctx.moveTo(...s); });
    if (closed) ctx.closePath();
  };
  const label = (text: string, p: Point, color = '#687a80', size = 11) => {
    ctx.font = `500 ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, ...p);
  };

  if (options.grid && scale > 0) {
    const step = 20;
    const x0 = center[0] - width / (2 * scale), x1 = center[0] + width / (2 * scale);
    const y0 = center[1] - height / (2 * scale), y1 = center[1] + height / (2 * scale);
    ctx.lineWidth = 1; ctx.strokeStyle = '#e8eeef'; ctx.beginPath();
    // Bound grid work even for unusual imported dimensions.
    const stride = Math.max(step, Math.ceil((x1 - x0 + y1 - y0) / 200 / step) * step);
    for (let x = Math.ceil(x0 / stride) * stride; x <= x1; x += stride) {
      ctx.moveTo(...screen([x, y0])); ctx.lineTo(...screen([x, y1]));
    }
    for (let y = Math.ceil(y0 / stride) * stride; y <= y1; y += stride) {
      ctx.moveTo(...screen([x0, y])); ctx.lineTo(...screen([x1, y]));
    }
    ctx.stroke();
  }

  path(chassis.collision.outline_xy_mm, true);
  ctx.fillStyle = '#f0e9e680'; ctx.fill();

  for (const wheel of wheelShapes) {
    const isDrive = wheel.kind === 'drive';
    path(wheel.outline, true);
    ctx.fillStyle = isDrive ? '#d3dfe2' : '#f3e5c9'; ctx.fill();
    ctx.strokeStyle = isDrive ? '#506d78' : '#b78028'; ctx.lineWidth = 1.4;
    ctx.setLineDash(isDrive ? [] : [5, 3]); ctx.stroke(); ctx.setLineDash([]);
    const wb = bounds(wheel.outline);
    ctx.save(); path(wheel.outline, true); ctx.clip();
    ctx.lineWidth = 1; ctx.strokeStyle = isDrive ? '#9bb0b8' : '#d1b27b';
    const lineStep = (wb.maxX - wb.minX) / (isDrive ? 10 : 6);
    for (let x = wb.minX + lineStep / 2; x < wb.maxX; x += lineStep) {
      path([[x, wb.minY], [x + (isDrive ? 0 : lineStep / 2), wb.maxY]]); ctx.stroke();
    }
    ctx.restore();
    const c = local(wheel.center);
    ctx.beginPath(); ctx.arc(...c, 3, 0, Math.PI * 2); ctx.fillStyle = '#fafcfc'; ctx.fill();
    ctx.strokeStyle = '#56717a'; ctx.stroke();
  }

  ctx.strokeStyle = '#91a1a6'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
  for (const [x, track] of [[0, chassis.drive_axle.track_width_mm], [chassis.front_axle.x_mm, chassis.front_axle.track_width_mm]]) {
    path([[x, -track / 2], [x, track / 2]]); ctx.stroke();
  }
  ctx.setLineDash([]);

  path(chassis.collision.outline_xy_mm, true);
  ctx.strokeStyle = '#d3544d'; ctx.lineWidth = 2; ctx.stroke();
  for (const [i, point] of chassis.collision.outline_xy_mm.entries()) {
    const p = local(point); ctx.beginPath(); ctx.arc(...p, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#d3544d'; ctx.fill();
    if (options.labels) label(`P${i}`, [p[0] + (p[0] < width / 2 ? -13 : 13), p[1] + (p[1] < height / 2 ? -10 : 11)], '#b95450', 10);
  }

  for (const sensor of chassis.sensors.positions) {
    const p = local([sensor.x_mm, sensor.y_mm]);
    ctx.beginPath(); ctx.arc(...p, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#0c8a77'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    if (options.labels) label(sensor.id, [p[0], p[1] - 14], '#087562', 10);
  }

  const origin = local([0, 0]);
  ctx.strokeStyle = '#234450'; ctx.lineWidth = 1.4;
  for (const [point, text] of [[[23, 0], '+x'], [[0, 23], '+y']] as const) {
    const p = local(point);
    ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(...p); ctx.stroke();
    const angle = Math.atan2(p[1] - origin[1], p[0] - origin[0]);
    ctx.beginPath(); ctx.moveTo(...p);
    ctx.lineTo(p[0] - 6 * Math.cos(angle - 0.45), p[1] - 6 * Math.sin(angle - 0.45));
    ctx.lineTo(p[0] - 6 * Math.cos(angle + 0.45), p[1] - 6 * Math.sin(angle + 0.45));
    ctx.closePath(); ctx.fillStyle = '#234450'; ctx.fill();
    label(text, [p[0] + 12 * Math.cos(angle), p[1] + 12 * Math.sin(angle)], '#234450');
  }
  ctx.beginPath(); ctx.arc(...origin, 4, 0, Math.PI * 2); ctx.fillStyle = '#234450'; ctx.fill();
  if (options.labels) label('0, 0', [origin[0] + 20, origin[1] + 15], '#234450', 10);

  if (options.dimensions) {
    const b = bounds(chassis.collision.outline_xy_mm);
    const dimension = (a: Point, b: Point, text: string) => {
      const p = local(a), q = local(b);
      ctx.strokeStyle = '#7d9097'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
      for (const e of [p, q]) {
        ctx.beginPath(); ctx.moveTo(e[0] - 4 * Math.sin(angle), e[1] + 4 * Math.cos(angle));
        ctx.lineTo(e[0] + 4 * Math.sin(angle), e[1] - 4 * Math.cos(angle)); ctx.stroke();
      }
      const middle: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      ctx.save(); ctx.translate(...middle);
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle); ctx.font = '11px ui-monospace, Consolas, monospace';
      const labelWidth = ctx.measureText(text).width + 12;
      ctx.fillStyle = '#fafcfc'; ctx.fillRect(-labelWidth / 2, -9, labelWidth, 18);
      label(text, [0, 0], '#526c76'); ctx.restore();
    };
    dimension([b.maxX + 16, b.minY], [b.maxX + 16, b.maxY], `${format(b.maxY - b.minY)} mm`);
    dimension([b.minX, b.minY - 19], [b.maxX, b.minY - 19], `${format(b.maxX - b.minX)} mm`);
    dimension([b.minX - 16, -chassis.drive_axle.track_width_mm / 2], [b.minX - 16, chassis.drive_axle.track_width_mm / 2], `${format(chassis.drive_axle.track_width_mm)} mm track`);
  }

  // Fixed physical scale bar, independent of device pixel density.
  const barMM = 20, barX = 23, barY = height - 25;
  ctx.strokeStyle = '#526c76'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(barX, barY); ctx.lineTo(barX + barMM * scale, barY); ctx.stroke();
  label('20 mm', [barX + barMM * scale / 2, barY - 12], '#526c76', 10);
}
