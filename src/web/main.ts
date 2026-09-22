import './style.css';
import t90Yaml from '../../configs/chassis/T90L91.yaml?raw';
import t100Yaml from '../../configs/chassis/T100L101.yaml?raw';
import t90Reference from '../../references/T90L91.png';
import t100Reference from '../../references/T100L101.png';
import { parseChassis } from '../core/config';
import { bounds } from '../core/geometry';
import { sensorsLeftToRight } from '../core/chassis';
import { renderChassis } from './renderer';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Line follower sim home"><span class="brand-mark" aria-hidden="true">↱</span> LINE FOLLOWER <span class="brand-light">/ SIM</span></a>
    <nav class="studio-nav" aria-label="Simulator pages"><a href="./chassis.html" aria-current="page">Chassis</a><a href="./board.html">Game boards</a><a href="./observe.html">Sensors</a><a href="./simulate.html">Run</a><a href="./sweep.html">Sweeps</a></nav>
  </header>
  <main>
    <section class="page-heading">
      <div><p class="eyebrow">DESIGN WORKSPACE</p><h1>Chassis studio<span>.</span></h1><p class="intro">Get the geometry right before the robot moves.</p></div>
      <div class="heading-actions"><label class="button secondary file-button">Import YAML<input id="import" type="file" accept=".yaml,.yml,text/yaml" /></label><button id="download" class="button primary">Download YAML <span aria-hidden="true">↓</span></button></div>
    </section>
    <div class="workspace">
      <section class="viewer-panel" aria-label="Chassis visualization">
        <div class="panel-heading"><div><span class="eyebrow">TOP VIEW</span><h2 id="chassis-name"></h2></div><label class="chassis-picker">Chassis file<select id="chassis-select"><option value="T90L91">T90L91</option><option value="T100L101">T100L101</option></select></label><span class="units-pill">ALL DISTANCES IN mm</span></div>
        <div class="view-controls"><label><input id="grid" type="checkbox" checked /> Grid</label><label><input id="labels" type="checkbox" checked /> Labels</label><label><input id="dimensions" type="checkbox" checked /> Dimensions</label><button id="reset-view" class="text-button">Reset view ↺</button></div>
        <div class="canvas-wrap"><canvas id="chassis-canvas" role="img" aria-label="Top view of chassis geometry; detailed coordinates are in the parameter panel"></canvas><span class="view-caption">+x forward · +y left · +z toward you</span></div>
        <div class="legend"><span><i class="swatch collision"></i>Collision polygon</span><span><i class="swatch drive"></i>Drive wheels</span><span><i class="swatch omni"></i>Omni envelopes</span><span><i class="swatch sensor"></i>Optical centers</span></div>
        <div class="camera-controls"><label>Zoom <input id="zoom" type="range" min="0.6" max="1.7" step="0.05" value="1" /><output id="zoom-value">100%</output></label><label>Heading <input id="heading" type="range" min="-180" max="180" step="1" value="90" /><output id="heading-value">90°</output></label><button id="export-png" class="text-button">Save image ↓</button></div>
        <div class="metrics" id="metrics"></div>
        <div class="reference-bar"><a id="reference" class="reference-link" target="_blank" rel="noopener"></a><span>Origin: drive axle midpoint · distances in mm</span></div>
      </section>
      <aside class="inspector" aria-label="Chassis configuration">
        <div class="tabs" role="tablist" aria-label="Configuration views"><button id="parameters-tab" role="tab" aria-selected="true" aria-controls="parameters-panel" tabindex="0">Parameters</button><button id="yaml-tab" role="tab" aria-selected="false" aria-controls="yaml-panel" tabindex="-1">YAML editor</button></div>
        <div id="parameters-panel" class="inspector-content" role="tabpanel" aria-labelledby="parameters-tab">
          <div class="section-heading"><h3>Geometry at a glance</h3><span class="tiny-tag">mm</span></div>
          <div id="parameter-tables"></div>
          <details class="coordinate-details"><summary>Collision polygon vertices</summary><div id="polygon-table"></div><p class="help">Ordered local coordinates. The camera is excluded; visual parts do not expand this boundary.</p></details>
        </div>
        <div id="yaml-panel" class="inspector-content" role="tabpanel" aria-labelledby="yaml-tab" hidden>
          <div class="section-heading"><h3>Edit the configuration</h3><span id="editor-state" class="tiny-tag">Applied</span></div>
          <p class="help">Apply edits to redraw. Download saves the applied configuration; it does not overwrite your local file.</p>
          <label class="sr-only" for="yaml-editor">Chassis YAML</label><textarea id="yaml-editor" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
          <div class="editor-actions"><button id="apply" class="button primary">Apply changes</button><button id="restore" class="text-button">Restore T90L91</button></div>
          <p class="help">Ctrl / ⌘ + Enter to apply · All coordinates in mm.</p>
        </div>
        <p id="status" class="status" role="status" aria-live="polite"></p><pre id="error" role="alert" hidden></pre>
      </aside>
    </div>
    <section id="review-panel" class="review-panel" hidden><div><p class="eyebrow">CHECK BEFORE SIMULATING</p><h2>Drawing review</h2><p class="help">Review notes travel with the YAML.</p></div><ul id="review-notes"></ul></section>
    <footer><span>Two chassis. Eight optical sensors. A shared geometry model.</span><span>Chassis geometry</span></footer>
  </main>`;

function el<T extends HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
const canvas = el<HTMLCanvasElement>('#chassis-canvas');
const editor = el<HTMLTextAreaElement>('#yaml-editor');
const error = el<HTMLPreElement>('#error');
const presets = { T90L91: t90Yaml, T100L101: t100Yaml };
type Preset = keyof typeof presets;
let selectedPreset: Preset = new URL(location.href).searchParams.get('model') === 'T100L101' ? 'T100L101' : 'T90L91';
const edits = new Map<Preset, { applied: string; draft: string }>();
let appliedYaml = presets[selectedPreset];
let chassis = parseChassis(appliedYaml);
editor.value = appliedYaml;
el<HTMLSelectElement>('#chassis-select').value = selectedPreset;
const references: Record<string, string> = { 'references/T90L91.png': t90Reference, 'references/T100L101.png': t100Reference };
const format = (value: number) => Number(value.toFixed(3)).toString();

function table(headers: string[], rows: (string | number)[][]): HTMLTableElement {
  const t = document.createElement('table');
  const head = t.createTHead().insertRow();
  for (const title of headers) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; head.append(th); }
  const body = t.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    values.forEach(value => { row.insertCell().textContent = typeof value === 'number' ? format(value) : value; });
  }
  return t;
}

function draw() {
  renderChassis(canvas, chassis, { x: 0, y: 0, heading: Number(el<HTMLInputElement>('#heading').value) * Math.PI / 180 }, {
    zoom: Number(el<HTMLInputElement>('#zoom').value),
    labels: el<HTMLInputElement>('#labels').checked,
    dimensions: el<HTMLInputElement>('#dimensions').checked,
    grid: el<HTMLInputElement>('#grid').checked,
  });
  el('#zoom-value').textContent = `${Math.round(Number(el<HTMLInputElement>('#zoom').value) * 100)}%`;
  el('#heading-value').textContent = `${el<HTMLInputElement>('#heading').value}°`;
}

function refresh() {
  el('#chassis-name').textContent = chassis.name;
  el('#restore').textContent = `Restore ${selectedPreset}`;
  const reference = el<HTMLAnchorElement>('#reference');
  reference.hidden = !references[chassis.source];
  if (references[chassis.source]) {
    reference.href = references[chassis.source];
    reference.textContent = `Open ${chassis.source.split('/').pop()?.replace('.png', '')} source drawing ↗`;
  }
  const b = bounds(chassis.collision.outline_xy_mm);
  const metrics = el('#metrics'); metrics.replaceChildren();
  for (const [name, value] of [['Outline width', b.maxY - b.minY], ['Outline length', b.maxX - b.minX], ['Wheelbase', chassis.front_axle.x_mm]] as const) {
    const div = document.createElement('div'), label = document.createElement('span'), number = document.createElement('strong');
    label.textContent = name; number.textContent = `${format(value)} mm`; div.append(label, number); metrics.append(div);
  }
  const target = el('#parameter-tables'); target.replaceChildren();
  target.append(table(['Wheel geometry', 'Drive', 'Front omni'], [
    ['Axle x (mm)', 0, chassis.front_axle.x_mm],
    ['Track (mm)', chassis.drive_axle.track_width_mm, chassis.front_axle.track_width_mm],
    ['Diameter (mm)', chassis.drive_axle.wheel_diameter_mm, chassis.front_axle.wheel_diameter_mm],
    ['Width (mm)', chassis.drive_axle.tire_width_mm, chassis.front_axle.tire_width_mm],
  ]));
  const title = document.createElement('h3'); title.className = 'sensor-heading'; title.textContent = 'Optical sensor centers'; target.append(title);
  target.append(table(['Left → right', 'x (mm)', 'y (mm)'], sensorsLeftToRight(chassis).map(s => [s.id, s.x_mm, s.y_mm])));
  const hint = document.createElement('p'); hint.className = 'help'; hint.textContent = 'Markers locate optical centers. Their drawing size is not the sensing footprint.'; target.append(hint);
  el('#polygon-table').replaceChildren(table(['Vertex', 'x (mm)', 'y (mm)'], chassis.collision.outline_xy_mm.map((p, i) => [`P${i}`, ...p])));
  const notes = el('#review-notes'); notes.replaceChildren();
  el('#review-panel').hidden = chassis.review_notes.length === 0;
  for (const text of chassis.review_notes) {
    const li = document.createElement('li'); li.textContent = text; notes.append(li);
  }
  draw();
}

function reportError(e: unknown) { error.textContent = e instanceof Error ? e.message : String(e); error.hidden = false; el('#status').textContent = 'Not applied. The drawing still shows the last valid configuration.'; }
function apply(text = editor.value): boolean {
  try {
    const next = parseChassis(text);
    chassis = next; appliedYaml = text; editor.value = text;
    error.hidden = true; el('#editor-state').textContent = 'Applied';
    el('#status').textContent = `${chassis.name} applied. All distances in mm.`;
    refresh(); return true;
  } catch (e) { reportError(e); return false; }
}
function setTab(name: 'parameters' | 'yaml') {
  for (const key of ['parameters', 'yaml']) {
    const selected = key === name;
    el(`#${key}-tab`).setAttribute('aria-selected', String(selected));
    el(`#${key}-tab`).tabIndex = selected ? 0 : -1;
    el(`#${key}-panel`).hidden = !selected;
  }
}
for (const name of ['parameters', 'yaml'] as const) {
  el(`#${name}-tab`).addEventListener('click', () => setTab(name));
  el(`#${name}-tab`).addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const other = name === 'parameters' ? 'yaml' : 'parameters'; setTab(other); el(`#${other}-tab`).focus(); e.preventDefault();
    }
  });
}
editor.addEventListener('input', () => { el('#editor-state').textContent = editor.value === appliedYaml ? 'Applied' : 'Unapplied edits'; });
editor.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } });
el('#apply').addEventListener('click', () => apply());
el('#restore').addEventListener('click', () => apply(presets[selectedPreset]));
el<HTMLSelectElement>('#chassis-select').addEventListener('change', e => {
  edits.set(selectedPreset, { applied: appliedYaml, draft: editor.value });
  selectedPreset = (e.currentTarget as HTMLSelectElement).value as Preset;
  const saved = edits.get(selectedPreset);
  apply(saved?.applied ?? presets[selectedPreset]);
  if (saved) editor.value = saved.draft;
  el('#editor-state').textContent = editor.value === appliedYaml ? 'Applied' : 'Unapplied edits';
  const url = new URL(location.href); url.searchParams.set('model', selectedPreset);
  history.replaceState(null, '', url);
});
for (const id of ['zoom', 'heading', 'grid', 'labels', 'dimensions']) el(`#${id}`).addEventListener('input', draw);
el('#reset-view').addEventListener('click', () => {
  el<HTMLInputElement>('#zoom').value = '1'; el<HTMLInputElement>('#heading').value = '90'; draw();
});
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeName = () => chassis.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'chassis';
el('#download').addEventListener('click', () => {
  if (editor.value !== appliedYaml && !apply()) { setTab('yaml'); return; }
  download(new Blob([appliedYaml], { type: 'text/yaml;charset=utf-8' }), `${safeName()}.yaml`);
});
el('#export-png').addEventListener('click', () => canvas.toBlob(blob => { if (blob) download(blob, `${safeName()}.png`); }));
el<HTMLInputElement>('#import').addEventListener('change', async e => {
  const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 200_000) throw new Error('YAML file exceeds 200 KB limit.');
    const text = await file.text();
    editor.value = text; el('#editor-state').textContent = 'Unapplied edits';
    if (!apply(text)) setTab('yaml');
  } catch (e) { reportError(e); }
  input.value = '';
});
new ResizeObserver(draw).observe(canvas);
window.addEventListener('resize', draw);
refresh();
