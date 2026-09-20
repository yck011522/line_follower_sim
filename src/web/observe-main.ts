import './style.css';
import './observe.css';
import t90Yaml from '../../configs/chassis/T90L91.yaml?raw';
import t100Yaml from '../../configs/chassis/T100L101.yaml?raw';
import loopYaml from '../../configs/boards/board_4_3_loop.yaml?raw';
import elleYaml from '../../configs/boards/board_4_3_elle.yaml?raw';
import snakeYaml from '../../configs/boards/board_4_3_snake.yaml?raw';
import { parseChassis } from '../core/config';
import { parseBoard } from '../core/board-config';
import type { Pose } from '../core/geometry';
import { observeSensors, prepareLine, resolveBoard } from '../core/sensing';
import { renderObservation } from './observation-renderer';
import { boardCamera } from './board-renderer';
import { columnClearances } from '../core/collision';

const chassisFiles = { T90L91: t90Yaml, T100L101: t100Yaml } as const;
const boardFiles = { loop: loopYaml, elle: elleYaml, snake: snakeYaml } as const;
type ChassisKey = keyof typeof chassisFiles;
type BoardKey = keyof typeof boardFiles;

document.querySelector('#app')!.innerHTML = `
  <header class="site-header"><a class="brand" href="./" aria-label="Line follower sim home"><span class="brand-mark" aria-hidden="true">↱</span> LINE FOLLOWER <span class="brand-light">/ SIM</span></a><nav class="studio-nav" aria-label="Simulator pages"><a href="./chassis.html">Chassis</a><a href="./board.html">Game boards</a><a href="./observe.html" aria-current="page">Sensors</a></nav></header>
  <main><section class="page-heading"><div><p class="eyebrow">SIMULATION WORKSPACE / STEP 03</p><h1>Sensor studio<span>.</span></h1><p class="intro">Place the robot. Inspect what each optical sensor sees.</p></div><span class="units-pill">IDEAL POINT SENSORS · ALL DISTANCES IN mm</span></section>
  <div class="observe-layout"><section class="viewer-panel"><div class="panel-heading"><div><span class="eyebrow">STATIC OBSERVATION</span><h2 id="scene-name"></h2></div><span id="drag-state" class="drag-hint">Drag the chassis to move it</span></div><div class="canvas-wrap observation-canvas-wrap"><canvas id="observation-canvas" role="img" aria-label="Chassis placed on a game board with eight sensor readings"></canvas></div><div class="legend"><span><i class="swatch black-line"></i>Black line</span><span><i class="swatch collision"></i>Chassis polygon</span><span><i class="swatch sensor-on"></i>Sensor on black</span><span><i class="swatch sensor-off"></i>Sensor on white</span></div><div class="camera-controls"><label>Zoom <input id="scene-zoom" type="range" min="0.65" max="1.5" step="0.05" value="1" /><output id="scene-zoom-value">100%</output></label><button id="reset-pose" class="text-button">Reset pose ↺</button></div></section>
  <aside class="inspector observation-controls"><div class="inspector-content"><div class="section-heading"><h3>Scene configuration</h3><span class="tiny-tag">LIVE</span></div>
    <label>Chassis<select id="scene-chassis"><option>T90L91</option><option>T100L101</option></select></label><label>Game board<select id="scene-board"><option value="loop">Loop</option><option value="elle">Elle</option><option value="snake">Snake</option></select></label>
    <div class="scene-grid"><label>Line width (mm)<input id="scene-width" type="number" min="0.1" step="0.5" value="20" /></label><label>Turn radius (mm)<input id="scene-radius" type="number" min="0.1" max="120" step="1" value="80" /></label><label>X (mm)<input id="pose-x" type="number" step="1" value="240" /></label><label>Y (mm)<input id="pose-y" type="number" step="1" value="120" /></label></div>
    <label>Orientation <span id="heading-output">0°</span><input id="pose-heading" type="range" min="-180" max="180" step="1" value="0" /></label>
    <p class="help">Simulation values override the board's default width and every corner radius. Dragging changes X and Y; use the slider for orientation.</p>
    <div class="section-heading readings-heading"><h3>Optical readings</h3><span id="hit-count" class="tiny-tag"></span></div><div id="sensor-readings" class="sensor-readings"></div>
    <div class="section-heading clearance-heading"><h3>Column-center clearance</h3><span id="clearance-state" class="tiny-tag"></span></div><div id="closest-column" class="closest-column"></div><details class="clearance-details"><summary>Five closest column centers</summary><div id="clearance-list" class="clearance-list"></div></details>
    <div class="distance-note"><strong>Reading rule</strong><span>Black = centerline distance ≤ half the line width.</span></div>
  </div><p id="scene-error" class="config-error" role="alert" hidden></p></aside></div>
  <section class="board-note"><span class="tiny-tag">ANALYTICAL SENSING</span><p>Sensors query finite line segments and circular arcs in millimetres. Display pixels, zoom, and antialiasing do not affect readings.</p></section><footer><span>Eight ideal point observations from shared board geometry.</span><span>Stage 3 · Static sensing</span></footer></main>`;

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const canvas = el<HTMLCanvasElement>('observation-canvas');
let chassisKey: ChassisKey = 'T90L91', boardKey: BoardKey = 'loop';
let pose: Pose = { x: 240, y: 120, heading: 0 }, dragging = false, dragOffset = { x: 0, y: 0 };
const chassisPresets = { T90L91: parseChassis(t90Yaml), T100L101: parseChassis(t100Yaml) };
const boardPresets = { loop: parseBoard(loopYaml), elle: parseBoard(elleYaml), snake: parseBoard(snakeYaml) };
let cachedKey = '';
let cachedScene: ReturnType<typeof buildPreparedScene> | undefined;
const format = (n: number) => Number(n.toFixed(3)).toString();

function buildPreparedScene(width: number, radius: number) {
  const chassis = chassisPresets[chassisKey], design = boardPresets[boardKey];
  const board = resolveBoard(design, { lineWidthMm: width, turnRadiusMm: radius });
  return { chassis, board, line: prepareLine(board) };
}
function scene() {
  const width = Number(el<HTMLInputElement>('scene-width').value), radius = Number(el<HTMLInputElement>('scene-radius').value);
  const key = `${chassisKey}|${boardKey}|${width}|${radius}`;
  if (!cachedScene || cachedKey !== key) { cachedScene = buildPreparedScene(width, radius); cachedKey = key; }
  const clearances = columnClearances(cachedScene.board, cachedScene.chassis, pose);
  return { ...cachedScene, observations: observeSensors(cachedScene.chassis, pose, cachedScene.line), clearances, closestColumn: clearances[0] };
}
function render() {
  try {
    const { chassis, board, observations, clearances, closestColumn } = scene();
    el('scene-error').hidden = true;
    el('scene-name').textContent = `${chassis.name} × ${board.name}`;
    el('heading-output').textContent = `${format(pose.heading * 180 / Math.PI)}°`;
    el<HTMLInputElement>('pose-x').value = format(pose.x); el<HTMLInputElement>('pose-y').value = format(pose.y);
    const zoom = Number(el<HTMLInputElement>('scene-zoom').value);
    el('scene-zoom-value').textContent = `${Math.round(zoom * 100)}%`;
    renderObservation(canvas, board, chassis, pose, observations, closestColumn, zoom);
    el('hit-count').textContent = `${observations.filter(o => o.value).length} / 8 BLACK`;
    const list = el('sensor-readings'); list.replaceChildren();
    for (const observation of observations) {
      const item = document.createElement('div'); item.className = observation.value ? 'reading on' : 'reading off';
      const id = document.createElement('strong'), state = document.createElement('span'), distance = document.createElement('small');
      id.textContent = observation.id; state.textContent = observation.value ? '1 · BLACK' : '0 · WHITE';
      distance.textContent = `${format(observation.centerlineDistanceMm)} mm to centerline`;
      item.append(id, state, distance); list.append(item);
    }
    const state = el('clearance-state'); state.textContent = closestColumn.collision ? 'COLLISION' : 'CLEAR'; state.className = `tiny-tag ${closestColumn.collision ? 'collision-state' : 'clear-state'}`;
    const closest = el('closest-column'); closest.replaceChildren();
    const name = document.createElement('strong'), value = document.createElement('b'), coordinate = document.createElement('span');
    name.textContent = closestColumn.columnId; value.textContent = `${format(closestColumn.clearanceMm)} mm`;
    coordinate.textContent = `Center (${format(closestColumn.columnCenter[0])}, ${format(closestColumn.columnCenter[1])}) mm`;
    closest.append(name, value, coordinate);
    const clearanceList = el('clearance-list'); clearanceList.replaceChildren();
    for (const clearance of clearances.slice(0, 5)) {
      const row = document.createElement('div'), id = document.createElement('span'), distance = document.createElement('strong');
      id.textContent = clearance.columnId; distance.textContent = `${format(clearance.clearanceMm)} mm`; row.append(id, distance); clearanceList.append(row);
    }
  } catch (error) {
    el('scene-error').textContent = error instanceof Error ? error.message : String(error); el('scene-error').hidden = false;
  }
}
function resetPose() { pose = { x: 240, y: 120, heading: 0 }; el<HTMLInputElement>('pose-heading').value = '0'; render(); }
for (const id of ['scene-width', 'scene-radius', 'pose-x', 'pose-y']) el(id).addEventListener('input', () => {
  if (id === 'pose-x') pose.x = Number(el<HTMLInputElement>(id).value);
  if (id === 'pose-y') pose.y = Number(el<HTMLInputElement>(id).value);
  render();
});
el('pose-heading').addEventListener('input', () => { pose.heading = Number(el<HTMLInputElement>('pose-heading').value) * Math.PI / 180; render(); });
el('scene-zoom').addEventListener('input', render);
el('scene-chassis').addEventListener('change', () => { chassisKey = el<HTMLSelectElement>('scene-chassis').value as ChassisKey; render(); });
el('scene-board').addEventListener('change', () => { boardKey = el<HTMLSelectElement>('scene-board').value as BoardKey; resetPose(); });
el('reset-pose').addEventListener('click', resetPose);
function pointerWorld(event: PointerEvent) {
  const board = boardPresets[boardKey], rect = canvas.getBoundingClientRect();
  return boardCamera(canvas, board, Number(el<HTMLInputElement>('scene-zoom').value)).unproject([event.clientX - rect.left, event.clientY - rect.top]);
}
canvas.addEventListener('pointerdown', event => {
  const [x, y] = pointerWorld(event);
  if (Math.hypot(x - pose.x, y - pose.y) > 110) return;
  dragging = true; dragOffset = { x: pose.x - x, y: pose.y - y }; canvas.setPointerCapture(event.pointerId); el('drag-state').textContent = 'Moving chassis…';
});
canvas.addEventListener('pointermove', event => {
  if (!dragging) return; const [x, y] = pointerWorld(event); pose.x = x + dragOffset.x; pose.y = y + dragOffset.y; render();
});
function stopDrag(event: PointerEvent) { if (!dragging) return; dragging = false; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); el('drag-state').textContent = 'Drag the chassis to move it'; }
canvas.addEventListener('pointerup', stopDrag); canvas.addEventListener('pointercancel', stopDrag);
new ResizeObserver(render).observe(canvas); window.addEventListener('resize', render); render();
