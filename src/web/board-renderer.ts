import type { Board } from '../core/board-config';
import { boardPrimitives, columnCenters } from '../core/board';
import type { Primitive } from '../core/board';
import type { Point } from '../core/geometry';

export interface BoardView { zoom: number; grid: boolean; columns: boolean; centerline: boolean; selected: readonly [number, number] | null }
export function boardCamera(canvas: HTMLCanvasElement, board: Board, zoom: number) {
  const width = board.tiles[0].length * board.grid_size_mm, height = board.tiles.length * board.grid_size_mm;
  const scale = Math.min((canvas.clientWidth - 100) / width, (canvas.clientHeight - 100) / height) * zoom;
  const project = ([x, y]: Point): Point => [canvas.clientWidth / 2 + (x - width / 2) * scale, canvas.clientHeight / 2 - (y - height / 2) * scale];
  const unproject = ([x, y]: Point): Point => [(x - canvas.clientWidth / 2) / scale + width / 2, height / 2 - (y - canvas.clientHeight / 2) / scale];
  return { width, height, scale, project, unproject };
}

export function renderBoard(canvas: HTMLCanvasElement, board: Board, view: BoardView): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f4f7f6'; ctx.fillRect(0, 0, w, h);
  const { width, height, scale, project } = boardCamera(canvas, board, view.zoom);
  const topLeft = project([0, height]);
  ctx.fillStyle = '#fff'; ctx.fillRect(...topLeft, width * scale, height * scale);
  ctx.strokeStyle = '#c6d5ce'; ctx.lineWidth = 1; ctx.strokeRect(...topLeft, width * scale, height * scale);
  const label = (text: string, p: Point, color = '#7e9388') => {
    ctx.font = '10px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, ...p);
  };
  const grid = board.grid_size_mm;
  if (view.selected) {
    const [r, c] = view.selected;
    const p = project([c * grid, (board.tiles.length - r) * grid]);
    ctx.fillStyle = '#e1f1eb99'; ctx.fillRect(...p, grid * scale, grid * scale);
  }
  if (view.grid) {
    ctx.strokeStyle = '#dfe7e2'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < board.tiles[0].length; c++) { ctx.moveTo(...project([c * grid, 0])); ctx.lineTo(...project([c * grid, height])); }
    for (let r = 1; r < board.tiles.length; r++) { ctx.moveTo(...project([0, r * grid])); ctx.lineTo(...project([width, r * grid])); }
    ctx.stroke();
  }
  function stroke(p: Primitive) {
    ctx.beginPath();
    if (p.kind === 'line') { ctx.moveTo(...project(p.from)); ctx.lineTo(...project(p.to)); }
    else {
      const center = project(p.center);
      ctx.arc(...center, p.radius_mm * scale, -p.start_angle_rad, -(p.start_angle_rad + p.sweep_angle_rad), p.sweep_angle_rad > 0);
    }
    ctx.stroke();
  }
  const primitives = boardPrimitives(board);
  ctx.strokeStyle = '#17201d'; ctx.lineWidth = board.line.default_width_mm * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  primitives.forEach(stroke);
  if (view.centerline) {
    ctx.strokeStyle = '#4ebe9f'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); primitives.forEach(stroke); ctx.setLineDash([]);
  }
  if (view.columns) {
    for (const column of columnCenters(board)) {
      const p = project(column.center);
      if (board.columns.display_diameter_mm > 0) {
        ctx.beginPath(); ctx.arc(...p, board.columns.display_diameter_mm * scale / 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#f2f5f4'; ctx.fill(); ctx.strokeStyle = '#8fa49b'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.fillStyle = '#536f63'; ctx.beginPath(); ctx.arc(...p, 1.6, 0, 2 * Math.PI); ctx.fill();
    }
  }
  if (view.selected) {
    const [r, c] = view.selected, p = project([c * grid, (board.tiles.length - r) * grid]);
    ctx.strokeStyle = '#249c7c'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.strokeRect(p[0] + 1, p[1] + 1, grid * scale - 2, grid * scale - 2); ctx.setLineDash([]);
  }
  for (let c = 0; c <= board.tiles[0].length; c++) {
    const p = project([c * grid, 0]); label(String(Number((c * grid).toFixed(3))), [p[0], p[1] + 21]);
  }
  for (let r = 0; r <= board.tiles.length; r++) {
    const p = project([0, r * grid]); label(String(Number((r * grid).toFixed(3))), [p[0] - 26, p[1]]);
  }
  label('X (mm) →', [w - 43, h - 14]);
  label('Y (mm) ↑', [45, 15]);
}
