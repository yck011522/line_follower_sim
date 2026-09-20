import type { Board } from '../core/board-config';
import type { Chassis } from '../core/chassis';
import { wheels } from '../core/chassis';
import type { Point, Pose } from '../core/geometry';
import { localToWorld } from '../core/geometry';
import type { SensorObservation } from '../core/sensing';
import type { ColumnClearance } from '../core/collision';
import { renderBoard, boardCamera } from './board-renderer';

export function renderObservation(canvas: HTMLCanvasElement, board: Board, chassis: Chassis, pose: Pose, observations: SensorObservation[], closestColumn: ColumnClearance | undefined, zoom: number): void {
  renderBoard(canvas, board, { zoom, grid: true, columns: true, centerline: false, selected: null });
  const ctx = canvas.getContext('2d')!, { scale, project } = boardCamera(canvas, board, zoom);
  const world = (point: Point) => project(localToWorld(point, pose));
  const polygon = (points: readonly Point[], fill: string, stroke: string, dash: number[] = []) => {
    ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(...world(point)) : ctx.moveTo(...world(point))); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  };
  polygon(chassis.collision.outline_xy_mm, '#d85c5140', '#d3544d');
  for (const wheel of wheels(chassis)) polygon(wheel.outline, wheel.kind === 'drive' ? '#b8cbd2cc' : '#eddbb9cc', wheel.kind === 'drive' ? '#526f79' : '#ac7929', wheel.kind === 'omni' ? [4, 3] : []);
  const origin = project([pose.x, pose.y]);
  const forward = world([35, 0]);
  ctx.strokeStyle = '#174b52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(...forward); ctx.stroke();
  ctx.fillStyle = '#174b52'; ctx.beginPath(); ctx.arc(...origin, 4, 0, 2 * Math.PI); ctx.fill();
  if (closestColumn) {
    const column = project(closestColumn.columnCenter), boundary = project(closestColumn.nearestBoundaryPoint);
    ctx.strokeStyle = closestColumn.collision ? '#c33f32' : '#8a5e16'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(...column); ctx.lineTo(...boundary); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(...column, Math.max(9, board.columns.display_diameter_mm * scale / 2 + 5), 0, 2 * Math.PI);
    ctx.strokeStyle = closestColumn.collision ? '#d43e35' : '#f0a51b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = closestColumn.collision ? '#a72e28' : '#815711'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(closestColumn.columnId, column[0], column[1] - 12);
  }
  for (const observation of observations) {
    const p = project(observation.world), hit = observation.value === 1;
    ctx.beginPath(); ctx.arc(...p, Math.max(5, 3.5 * scale), 0, 2 * Math.PI);
    ctx.fillStyle = hit ? '#ffbc2f' : '#ffffff'; ctx.fill(); ctx.strokeStyle = hit ? '#8e5e00' : '#15927b'; ctx.lineWidth = 2; ctx.stroke();
  }
}
