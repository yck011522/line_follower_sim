import './style.css';
import './board.css';
import { parseDocument } from 'yaml';
import loopYaml from '../../configs/boards/board_4_3_loop.yaml?raw';
import elleYaml from '../../configs/boards/board_4_3_elle.yaml?raw';
import snakeYaml from '../../configs/boards/board_4_3_snake.yaml?raw';
import loopRef from '../../references/board_4_3_loop.png';
import elleRef from '../../references/board_4_3_elle.png';
import snakeRef from '../../references/board_4_3_snake.png';
import { parseBoard, TILE_TYPES, isTurn } from '../core/board-config';
import type { TileType } from '../core/board-config';
import { topology, columnCenters, boardPrimitives, primitiveLength } from '../core/board';
import { renderBoard, boardCamera } from './board-renderer';

const presets = { loop: loopYaml, elle: elleYaml, snake: snakeYaml };
type Preset = keyof typeof presets;
const references: Record<string, string> = { 'references/board_4_3_loop.png': loopRef, 'references/board_4_3_elle.png': elleRef, 'references/board_4_3_snake.png': snakeRef };
const glyphs: Record<TileType, string> = { empty: '·', straight_ew: '─', straight_ns: '│', turn_ne: '╰', turn_nw: '╯', turn_se: '╭', turn_sw: '╮' };
const labels: Record<TileType, string> = { empty: 'Empty', straight_ew: 'Straight · E–W', straight_ns: 'Straight · N–S', turn_ne: 'Turn · N–E', turn_nw: 'Turn · N–W', turn_se: 'Turn · S–E', turn_sw: 'Turn · S–W' };

document.querySelector('#app')!.innerHTML = `
  <header class="site-header"><a class="brand" href="./" aria-label="Line follower sim home"><span class="brand-mark" aria-hidden="true">↱</span> LINE FOLLOWER <span class="brand-light">/ SIM</span></a><nav class="studio-nav" aria-label="Simulator pages"><a href="./chassis.html">Chassis</a><a href="./board.html" aria-current="page">Game boards</a><a href="./observe.html">Sensors</a><a href="./simulate.html">Run</a><a href="./sweep.html">Sweeps</a></nav></header>
  <main>
    <section class="page-heading"><div><p class="eyebrow">DESIGN WORKSPACE / STEP 02</p><h1>Board studio<span>.</span></h1><p class="intro">Shape the route. Tune every corner.</p></div><div class="heading-actions"><label class="button secondary file-button">Import YAML<input id="board-import" type="file" accept=".yaml,.yml,text/yaml" /></label><button id="board-download" class="button primary">Download YAML ↓</button></div></section>
    <div class="workspace board-workspace">
      <section class="viewer-panel" aria-label="Board visualization">
        <div class="panel-heading"><div><span class="eyebrow">GAME BOARD / TOP VIEW</span><h2 id="board-name"></h2></div><label class="chassis-picker">Board file<select id="board-select"><option value="loop">Loop</option><option value="elle">Elle</option><option value="snake">Snake</option></select></label><span class="units-pill">ALL DISTANCES IN mm</span></div>
        <div class="view-controls"><label><input id="board-grid" type="checkbox" checked /> Grid</label><label><input id="board-columns" type="checkbox" checked /> Columns</label><label><input id="board-centerline" type="checkbox" /> Centerline</label><button id="board-reset-view" class="text-button">Reset view ↺</button></div>
        <div class="canvas-wrap board-canvas-wrap"><canvas id="board-canvas" role="img" aria-label="Top view of the board. Use the tile editor for keyboard-accessible layout editing."></canvas></div>
        <div class="legend"><span><i class="swatch black-line"></i>Black line</span><span><i class="swatch column-mark"></i>Column centers</span><span><i class="swatch selected-mark"></i>Selected tile</span><span>Click a tile to edit</span></div>
        <div class="camera-controls"><label>Zoom <input id="board-zoom" type="range" min="0.6" max="1.6" step="0.05" value="1" /><output id="board-zoom-value">100%</output></label><button id="board-export-png" class="text-button">Save image ↓</button></div>
        <div id="board-metrics" class="metrics"></div>
        <div class="reference-bar"><a id="board-reference" class="reference-link" target="_blank" rel="noopener"></a><span>Origin: bottom left · +X right · +Y up</span></div>
        <div class="route-status"><span id="route-badge"></span><span id="route-length"></span></div>
        <details id="route-details" class="route-details" hidden><summary>Connection details</summary><ul id="route-issues"></ul></details>
      </section>
      <aside class="inspector" aria-label="Board configuration">
        <div class="tabs" role="tablist" aria-label="Board configuration views"><button id="design-tab" role="tab" aria-selected="true" aria-controls="design-panel">Design</button><button id="board-yaml-tab" role="tab" aria-selected="false" aria-controls="board-yaml-panel" tabindex="-1">YAML editor</button></div>
        <div id="design-panel" class="inspector-content" role="tabpanel" aria-labelledby="design-tab">
          <div class="section-heading"><h3>Line & corner geometry</h3><span class="tiny-tag">mm</span></div>
          <div class="param-control"><label for="turn-radius">Default corner radius <span>mm</span></label><input id="turn-radius" type="number" min="0.1" step="any" /><input id="turn-radius-slider" type="range" min="10" max="120" step="1" aria-label="Default corner radius in mm" /></div>
          <div class="param-control"><label for="line-width">Black line width <span>mm</span></label><input id="line-width" type="number" min="0.1" step="any" /><input id="line-width-slider" type="range" min="10" max="25" step="0.5" aria-label="Black line width in mm" /></div>
          <p class="help" id="radius-help"></p>
          <div class="section-heading tile-heading"><h3>Tile layout</h3><span id="tile-count" class="tiny-tag"></span></div>
          <div id="tile-grid" class="tile-grid" aria-label="Board tiles, rows from top to bottom"></div>
          <div class="selected-tile"><div class="section-heading"><h3 id="selected-tile-label"></h3><span class="tiny-tag">EDIT TILE</span></div><label for="tile-type">Connections</label><select id="tile-type"></select><label for="tile-radius">Corner radius override (mm)</label><input id="tile-radius" type="number" min="0.1" step="any" /><p class="help">Leave blank to use the board default. Straight tiles have no radius override.</p></div>
          <details class="board-settings"><summary>Grid & column appearance</summary><label for="grid-size">Structural grid spacing (mm)</label><input id="grid-size" type="number" min="1" step="any" /><label for="column-diameter">Column display diameter (mm)</label><input id="column-diameter" type="number" min="0" step="any" /><p class="help">Diameter is visual only. Future clearance and collision checks use the column center points.</p></details>
        </div>
        <div id="board-yaml-panel" class="inspector-content" role="tabpanel" aria-labelledby="board-yaml-tab" hidden><div class="section-heading"><h3>Edit the configuration</h3><span id="board-editor-state" class="tiny-tag">Applied</span></div><p class="help">Rows run top to bottom. Apply YAML edits before using the graphical controls.</p><label class="sr-only" for="board-yaml-editor">Board YAML</label><textarea id="board-yaml-editor" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><div class="editor-actions"><button id="board-apply" class="button primary">Apply changes</button><button id="board-restore" class="text-button">Restore preset</button></div><p class="help">Ctrl / ⌘ + Enter to apply. Downloads do not overwrite your repository files.</p></div>
        <p id="board-status" class="status" role="status" aria-live="polite"></p><pre id="board-error" class="config-error" role="alert" hidden></pre>
      </aside>
    </div>
    <section class="board-note"><span class="tiny-tag">PARAMETRIC BY DESIGN</span><p id="board-note-text"></p></section>
    <footer><span>Three reference layouts. One shared geometry model.</span><span>Stage 2 · Board design & visualization</span></footer>
  </main>`;

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const canvas = el<HTMLCanvasElement>('board-canvas'), editor = el<HTMLTextAreaElement>('board-yaml-editor');
const requested = new URL(location.href).searchParams.get('board');
let preset: Preset = requested === 'elle' || requested === 'snake' ? requested : 'loop';
let appliedYaml = presets[preset], board = parseBoard(appliedYaml);
let selected: [number, number] = [0, 0];
const edits = new Map<Preset, { applied: string; draft: string }>();
editor.value = appliedYaml; el<HTMLSelectElement>('board-select').value = preset;
const format = (n: number) => Number(n.toFixed(3)).toString();
for (const type of TILE_TYPES) {
  const option = document.createElement('option'); option.value = type; option.textContent = labels[type]; el('tile-type').append(option);
}
function draw() {
  renderBoard(canvas, board, {
    zoom: Number(el<HTMLInputElement>('board-zoom').value), grid: el<HTMLInputElement>('board-grid').checked,
    columns: el<HTMLInputElement>('board-columns').checked, centerline: el<HTMLInputElement>('board-centerline').checked, selected,
  });
  el('board-zoom-value').textContent = `${Math.round(Number(el<HTMLInputElement>('board-zoom').value) * 100)}%`;
}
function refreshSelection() {
  const [r, c] = selected, tile = board.tiles[r][c];
  el('selected-tile-label').textContent = `Row ${r + 1} · Column ${c + 1}`;
  el<HTMLSelectElement>('tile-type').value = tile.type;
  const radius = el<HTMLInputElement>('tile-radius');
  radius.disabled = !isTurn(tile.type); radius.max = String(board.grid_size_mm / 2);
  radius.placeholder = `Default: ${format(board.line.default_turn_radius_mm)}`; radius.value = tile.radius_mm === undefined ? '' : String(tile.radius_mm);
  el('tile-grid').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.row) === r && Number(button.dataset.col) === c)));
  draw();
}
function refresh() {
  el('board-name').textContent = board.name;
  const half = board.grid_size_mm / 2;
  el('board-note-text').textContent = `One ${format(board.grid_size_mm)} mm grid. Independent corner radii and line width. Column circles are a visual guide; their centers define the future clearance checks.`;
  for (const [id, value] of [
    ['turn-radius', board.line.default_turn_radius_mm], ['turn-radius-slider', board.line.default_turn_radius_mm],
    ['line-width', board.line.default_width_mm], ['line-width-slider', board.line.default_width_mm], ['grid-size', board.grid_size_mm], ['column-diameter', board.columns.display_diameter_mm],
  ] as const) {
    const input = el<HTMLInputElement>(id);
    if (id.startsWith('turn-radius')) input.max = String(half);
    if (id === 'turn-radius-slider') input.min = String(Math.min(10, half));
    input.value = String(value);
  }
  const overrides = board.tiles.flat().filter(t => t.radius_mm !== undefined).length;
  el('radius-help').textContent = `Radius limit: ${format(half)} mm (half a grid cell). ${overrides} corner override${overrides === 1 ? '' : 's'}.`;
  const metrics = el('board-metrics'); metrics.replaceChildren();
  for (const [name, value] of [['Board size', `${format(board.tiles[0].length * board.grid_size_mm)} × ${format(board.tiles.length * board.grid_size_mm)} mm`], ['Grid spacing', `${format(board.grid_size_mm)} mm`], ['Column centers', String(columnCenters(board).length)]]) {
    const item = document.createElement('div'), label = document.createElement('span'), number = document.createElement('strong');
    label.textContent = name; number.textContent = value; item.append(label, number); metrics.append(item);
  }
  const reference = el<HTMLAnchorElement>('board-reference'); reference.hidden = !references[board.source];
  if (references[board.source]) { reference.href = references[board.source]; reference.textContent = 'Open source drawing ↗'; }
  const tiles = el('tile-grid'); tiles.replaceChildren(); tiles.style.gridTemplateColumns = `repeat(${board.tiles[0].length}, minmax(0, 1fr))`;
  board.tiles.forEach((row, r) => row.forEach((tile, c) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.row = String(r); button.dataset.col = String(c);
    button.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}: ${labels[tile.type]}${tile.radius_mm === undefined ? '' : `, radius ${tile.radius_mm} mm`}`);
    button.title = `${tile.type}${tile.radius_mm === undefined ? '' : ` · ${tile.radius_mm} mm`}`;
    const icon = document.createElement('span'); icon.className = 'tile-glyph'; icon.textContent = glyphs[tile.type]; icon.setAttribute('aria-hidden', 'true');
    const tag = document.createElement('small'); tag.textContent = tile.radius_mm === undefined ? `${r + 1},${c + 1}` : `${format(tile.radius_mm)} mm`;
    button.append(icon, tag); tiles.append(button);
  }));
  el('tile-count').textContent = `${board.tiles[0].length} × ${board.tiles.length}`;
  selected = [Math.min(selected[0], board.tiles.length - 1), Math.min(selected[1], board.tiles[0].length - 1)];
  const connections = topology(board), badge = el('route-badge');
  badge.textContent = connections.singleClosedLoop ? '● One closed loop' : connections.activeTiles === 0 ? '○ No line tiles' : connections.issues.length ? `○ ${connections.issues.length} unmatched connections` : `○ ${connections.components} separate closed loops`;
  badge.className = connections.singleClosedLoop ? 'route-good' : 'route-warning';
  el('route-length').textContent = `Centerline length: ${format(boardPrimitives(board).reduce((sum, p) => sum + primitiveLength(p), 0))} mm`;
  const issues = el('route-issues'); issues.replaceChildren();
  for (const issue of connections.issues.slice(0, 30)) { const li = document.createElement('li'); li.textContent = issue; issues.append(li); }
  if (connections.issues.length > 30) { const li = document.createElement('li'); li.textContent = `${connections.issues.length - 30} more unmatched connections.`; issues.append(li); }
  el('route-details').hidden = connections.issues.length === 0;
  el('board-restore').textContent = `Restore ${preset[0].toUpperCase() + preset.slice(1)}`;
  refreshSelection();
}
function reportError(error: unknown) {
  el('board-error').textContent = error instanceof Error ? error.message : String(error); el('board-error').hidden = false;
  el('board-status').textContent = 'Not applied. The drawing keeps the last valid configuration.';
}
function apply(text = editor.value): boolean {
  try {
    const next = parseBoard(text); board = next; appliedYaml = text; editor.value = text;
    el('board-editor-state').textContent = 'Applied'; el('board-error').hidden = true;
    el('board-status').textContent = `${board.name} applied. All distances in mm.`;
    refresh(); return true;
  } catch (error) { reportError(error); return false; }
}
function edit(path: (string | number)[], value: unknown) {
  if (editor.value !== appliedYaml) {
    el('board-status').textContent = 'Apply or restore the pending YAML edits before changing graphical controls.'; refresh(); return;
  }
  const doc = parseDocument(appliedYaml); doc.setIn(path, value);
  if (!apply(doc.toString())) refresh();
}
function setTab(name: 'design' | 'yaml') {
  for (const [key, tab, panel] of [['design', 'design-tab', 'design-panel'], ['yaml', 'board-yaml-tab', 'board-yaml-panel']]) {
    const active = name === key; el(tab).setAttribute('aria-selected', String(active)); el(tab).tabIndex = active ? 0 : -1; el(panel).hidden = !active;
  }
}
for (const [tab, name] of [['design-tab', 'design'], ['board-yaml-tab', 'yaml']] as const) {
  el(tab).addEventListener('click', () => setTab(name));
  el(tab).addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const other = name === 'design' ? 'yaml' : 'design'; setTab(other); el(other === 'design' ? 'design-tab' : 'board-yaml-tab').focus(); e.preventDefault();
    }
  });
}
for (const [id, path] of [
  ['turn-radius', ['line', 'default_turn_radius_mm']], ['turn-radius-slider', ['line', 'default_turn_radius_mm']],
  ['line-width', ['line', 'default_width_mm']], ['line-width-slider', ['line', 'default_width_mm']],
  ['grid-size', ['grid_size_mm']], ['column-diameter', ['columns', 'display_diameter_mm']],
] as const) el(id).addEventListener(id.endsWith('slider') ? 'input' : 'change', () => edit([...path], Number(el<HTMLInputElement>(id).value)));
el('tile-grid').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  selected = [Number(button.dataset.row), Number(button.dataset.col)]; refreshSelection();
});
canvas.addEventListener('click', event => {
  const rect = canvas.getBoundingClientRect(), camera = boardCamera(canvas, board, Number(el<HTMLInputElement>('board-zoom').value));
  const [x, y] = camera.unproject([event.clientX - rect.left, event.clientY - rect.top]);
  if (x < 0 || y < 0 || x >= camera.width || y >= camera.height) return;
  selected = [board.tiles.length - 1 - Math.floor(y / board.grid_size_mm), Math.floor(x / board.grid_size_mm)]; setTab('design'); refreshSelection();
});
el('tile-type').addEventListener('change', () => {
  const type = el<HTMLSelectElement>('tile-type').value as TileType, old = board.tiles[selected[0]][selected[1]];
  edit(['tiles', ...selected], isTurn(type) && old.radius_mm !== undefined ? { type, radius_mm: old.radius_mm } : type);
});
el('tile-radius').addEventListener('change', () => {
  const value = el<HTMLInputElement>('tile-radius').value, tile = board.tiles[selected[0]][selected[1]];
  edit(['tiles', ...selected], value === '' ? tile.type : { type: tile.type, radius_mm: Number(value) });
});
editor.addEventListener('input', () => { el('board-editor-state').textContent = editor.value === appliedYaml ? 'Applied' : 'Unapplied edits'; });
editor.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } });
el('board-apply').addEventListener('click', () => apply());
el('board-restore').addEventListener('click', () => apply(presets[preset]));
el('board-select').addEventListener('change', () => {
  edits.set(preset, { applied: appliedYaml, draft: editor.value }); preset = el<HTMLSelectElement>('board-select').value as Preset;
  const saved = edits.get(preset); selected = [0, 0]; apply(saved?.applied ?? presets[preset]);
  if (saved) editor.value = saved.draft;
  el('board-editor-state').textContent = editor.value === appliedYaml ? 'Applied' : 'Unapplied edits';
  const url = new URL(location.href); url.searchParams.set('board', preset); history.replaceState(null, '', url);
});
for (const id of ['board-grid', 'board-columns', 'board-centerline', 'board-zoom']) el(id).addEventListener('input', draw);
el('board-reset-view').addEventListener('click', () => { el<HTMLInputElement>('board-zoom').value = '1'; draw(); });
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filename = () => `board_${board.tiles[0].length}_${board.tiles.length}_${board.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}`;
el('board-download').addEventListener('click', () => {
  if (editor.value !== appliedYaml && !apply()) { setTab('yaml'); return; }
  download(new Blob([appliedYaml], { type: 'text/yaml;charset=utf-8' }), `${filename()}.yaml`);
});
el('board-export-png').addEventListener('click', () => {
  // Omit the editor's selection highlight from the exported drawing.
  renderBoard(canvas, board, { zoom: Number(el<HTMLInputElement>('board-zoom').value), grid: el<HTMLInputElement>('board-grid').checked, columns: el<HTMLInputElement>('board-columns').checked, centerline: el<HTMLInputElement>('board-centerline').checked, selected: null });
  canvas.toBlob(blob => { if (blob) download(blob, `${filename()}.png`); draw(); });
});
el<HTMLInputElement>('board-import').addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]; if (!file) return;
  try {
    if (file.size > 200_000) throw new Error('YAML file exceeds 200 KB limit.');
    editor.value = await file.text(); el('board-editor-state').textContent = 'Unapplied edits';
    if (!apply()) setTab('yaml');
  } catch (error) { reportError(error); }
  input.value = '';
});
new ResizeObserver(draw).observe(canvas); window.addEventListener('resize', draw); refresh();
