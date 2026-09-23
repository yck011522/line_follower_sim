import './style.css';
import './simulation.css';
import t90Yaml from '../../configs/chassis/T90L91.yaml?raw';
import t100Yaml from '../../configs/chassis/T100L101.yaml?raw';
import loopYaml from '../../configs/boards/board_4_3_loop.yaml?raw';
import elleYaml from '../../configs/boards/board_4_3_elle.yaml?raw';
import snakeYaml from '../../configs/boards/board_4_3_snake.yaml?raw';
import { parseChassis } from '../core/config';
import { parseBoard } from '../core/board-config';
import { resolveBoard } from '../core/sensing';
import { closestColumnClearance } from '../core/collision';
import type { Pose } from '../core/geometry';
import type { SimulationConfig, SimulationState, SimulationSummary } from '../core/simulation';
import { cancelSimulation, createSimulation, SIMULATION_ENGINE_VERSION, simulationSummary, stepSimulation } from '../core/simulation';
import { renderObservation } from './observation-renderer';
import { boardSvg } from '../core/board-svg';

const chassisPresets = { T90L91: parseChassis(t90Yaml), T100L101: parseChassis(t100Yaml) };
const boardPresets = { loop: parseBoard(loopYaml), elle: parseBoard(elleYaml), snake: parseBoard(snakeYaml) };
type ChassisKey = keyof typeof chassisPresets; type BoardKey = keyof typeof boardPresets;

document.querySelector('#app')!.innerHTML = `
<header class="site-header"><a class="brand" href="./"><span class="brand-mark">↱</span> LINE FOLLOWER <span class="brand-light">/ SIM</span></a><nav class="studio-nav"><a href="./chassis.html">Chassis</a><a href="./board.html">Boards</a><a href="./observe.html">Sensors</a><a href="./simulate.html" aria-current="page">Run</a><a href="./sweep.html">Sweeps</a><a href="./pid-tuning.html">PID tuning</a><a href="./robustness.html">Robustness</a></nav></header>
<main><section class="page-heading"><div><p class="eyebrow">SIMULATION WORKSPACE / STEPS 04–05</p><h1>Run studio<span>.</span></h1><p class="intro">Tune the controller, run faster than real time, and replay the same conditions live.</p></div><span class="units-pill">50 Hz · mm · seconds</span></section>
<div class="run-layout"><section class="viewer-panel"><div class="panel-heading"><div><span class="eyebrow">DETERMINISTIC TRIAL</span><h2 id="run-name">Ready</h2></div><span class="units-pill" id="run-clock">0.00 s</span></div><div class="canvas-wrap run-canvas-wrap"><canvas id="run-canvas"></canvas></div><div class="legend"><span>Yellow: black-line sensor</span><span>Shadow: previous 1 second</span><span>Dashed line: closest column</span></div><div class="run-status"><span id="live-command">L 0.0 · R 0.0 mm/s</span><strong id="run-status">READY</strong></div></section>
<aside class="inspector run-controls"><div class="run-section"><h3>Scene and initial condition</h3><div class="run-grid"><label>Chassis<select id="chassis"><option>T90L91</option><option>T100L101</option></select></label><label>Board<select id="board"><option value="loop">Loop</option><option value="elle">Elle</option><option value="snake">Snake</option></select></label><label>Line width (mm)<input id="width" type="number" value="20" min="1" step="1"></label><label>Turn radius (mm)<input id="radius" type="number" value="80" min="1" max="120" step="1"></label><label>Start X (mm)<input id="start-x" type="number" value="240" step="1"></label><label>Start Y (mm)<input id="start-y" type="number" value="120" step="1"></label><label>Heading (deg)<input id="heading" type="number" value="0" step="1"></label><label>Duration (s)<input id="duration" type="number" value="60" min="0.02" step="1"></label><label>Noise severity<input id="noise-severity" type="number" value="0" min="0" step="0.05"></label><label>Noise seed<input id="noise-seed" type="number" value="0" min="0" step="1"></label></div><p class="run-note">Severity and seed reproduce a robustness trial exactly. Severity zero uses ideal sensing and motion.</p></div>
<div class="run-section"><h3>Two-level PID controller</h3><div class="run-grid"><label>Target speed (mm/s)<input id="speed" type="number" value="120" min="0" step="10"></label><label>Wheel limit (mm/s)<input id="wheel-limit" type="number" value="250" min="1" step="10"></label><label>Kp (rad/s per mm)<input id="kp" type="number" value="0.08" min="0" step="0.005"></label><label>Ki<input id="ki" type="number" value="0" min="0" step="0.001"></label><label>Kd<input id="kd" type="number" value="0.002" min="0" step="0.001"></label><label>Max yaw (rad/s)<input id="max-yaw" type="number" value="3" min="0" step="0.1"></label><label>Acceleration (mm/s²)<input id="acceleration" type="number" value="300" min="1" step="10"></label><label>Deceleration (mm/s²)<input id="deceleration" type="number" value="2000" min="1" step="100"></label><label>Motor delay (s)<input id="motor-delay" type="number" value="0.05" min="0" step="0.01"></label></div><p class="run-note">The sensor centroid estimates lateral error. PID requests yaw rate; the wheel output is applied after the configured motor delay. <a id="pid-tuning-link" class="text-button" href="./pid-tuning.html">Map Kp × Kd →</a></p></div>
<div class="run-section"><div class="live-readings" id="live-readings"></div><div class="run-actions"><button class="button primary" id="fast-run">Fast run</button><button class="button secondary" id="replay">Real-time replay</button><button class="button secondary" id="cancel" disabled>Cancel</button></div><p id="run-error" class="config-error" role="alert" hidden></p></div>
<div class="run-section"><h3>Exports</h3><div id="summary" class="summary-grid"><p class="run-note">Run a trial to see its aggregate result.</p></div><div class="export-actions"><button class="button secondary" id="download" disabled>Download conditions + summary</button><button class="button secondary" id="download-board-svg">Download board SVG</button><button class="button secondary" id="record-video">Record replay (WebM)</button></div><p class="run-note">Video recording runs at real-time speed and downloads compressed WebM when the replay ends. The SVG omits the chassis.</p></div></aside></div>
<section class="board-note"><span class="tiny-tag">SHARED CORE</span><p>Each trial is a complete condition row plus one aggregate summary. The sweep studio runs the same core in background workers without rendering.</p></section><footer><span>Exact differential-drive integration with bounded collision substeps.</span><span>Closed-loop simulation</span></footer></main>`;

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const num = (id: string) => Number(el<HTMLInputElement>(id).value);
const fmt = (n: number | null, digits = 2) => n === null ? '—' : n.toFixed(digits);
const query = new URLSearchParams(location.search);
for (const [parameter, id] of Object.entries({ chassis:'chassis', board:'board', width:'width', radius:'radius', kp:'kp', kd:'kd', duration:'duration', x:'start-x', y:'start-y', heading:'heading', severity:'noise-severity', seed:'noise-seed', motorDelay:'motor-delay' })) {
  const value = query.get(parameter); if (value !== null) (el<HTMLInputElement | HTMLSelectElement>(id)).value = value;
}
type RunSpec = ReturnType<typeof conditions>;
let state: SimulationState | null = null, last: { conditions: unknown; summary: SimulationSummary } | null = null;
let activeSpec: RunSpec | null = null, lastSpec: RunSpec | null = null, executing = false;
let generation = 0, realtimeHandle = 0, lastWall = 0, wallAccumulator = 0;
let poseTrail:Pose[]=[],recorder:MediaRecorder|null=null,videoChunks:Blob[]=[];

function conditions() {
  const chassisKey = el<HTMLSelectElement>('chassis').value as ChassisKey;
  const boardKey = el<HTMLSelectElement>('board').value as BoardKey;
  const board = resolveBoard(boardPresets[boardKey], { lineWidthMm: num('width'), turnRadiusMm: num('radius') });
  const initialPose: Pose = { x: num('start-x'), y: num('start-y'), heading: num('heading') * Math.PI / 180 };
  const config: SimulationConfig = { durationS: num('duration'), controlDtS: 0.02, lineLossGraceS: 1, maxMotionSubstepMm: 2, maxRotationSubstepRad: Math.PI / 90, motorOutputDelayS:num('motor-delay'), noise: { severity:num('noise-severity'), seed:Math.floor(num('noise-seed')) },
    controller: { targetSpeedMmS: num('speed'), accelerationMmS2: num('acceleration'), decelerationMmS2: num('deceleration'), kp: num('kp'), ki: num('ki'), kd: num('kd'), integralLimitMmS: 100, maxYawRateRadS: num('max-yaw'), maxWheelSpeedMmS: num('wheel-limit') } };
  return { chassisKey, boardKey, lineWidthMm: num('width'), turnRadiusMm: num('radius'), chassis: chassisPresets[chassisKey], board, initialPose, config };
}
function freshState(spec = conditions()) { return { c: spec, simulation: createSimulation(spec.chassis, spec.board, spec.initialPose, spec.config) }; }
function render() {
  if (!state) { const fresh = freshState(); state = fresh.simulation; }
  const closest = closestColumnClearance(state.board, state.chassis, state.pose);
  renderObservation(el<HTMLCanvasElement>('run-canvas'), state.board, state.chassis, state.pose, state.observations, closest, 1,poseTrail);
  el('run-clock').textContent = `${state.timeS.toFixed(2)} / ${state.config.durationS.toFixed(2)} s`;
  el('run-name').textContent = `${state.chassis.name} × ${state.board.name}`;
  el('live-command').textContent = `L ${state.command.leftMmS.toFixed(1)} · R ${state.command.rightMmS.toFixed(1)} mm/s · error ${fmt(state.command.lineErrorMm)} mm`;
  el('run-status').textContent = executing ? state.status.replace('_', ' ') : state.status === 'running' ? 'ready' : state.status.replace('_', ' ');
  const readings = el('live-readings'); readings.replaceChildren(...state.observations.map(o => { const node = document.createElement('span'); node.className = `live-reading ${o.value ? 'on' : ''}`; node.textContent = `${o.id} ${o.value}`; return node; }));
  el<HTMLAnchorElement>('pid-tuning-link').href=`./pid-tuning.html?${new URLSearchParams({chassis:el<HTMLSelectElement>('chassis').value,board:el<HTMLSelectElement>('board').value,width:String(num('width')),radius:String(num('radius')),duration:String(num('duration')),speed:String(num('speed')),motorDelay:String(num('motor-delay'))})}`;
}
function setBusy(busy: boolean) { executing = busy; el<HTMLButtonElement>('fast-run').disabled = busy; el<HTMLButtonElement>('replay').disabled = busy; el<HTMLButtonElement>('record-video').disabled = busy; el<HTMLButtonElement>('cancel').disabled = !busy; }
function showSummary(summary: SimulationSummary) {
  const rows = [['Result', summary.status], ['Simulated time', `${fmt(summary.actualDurationS)} s`], ['Distance', `${fmt(summary.distanceTraveledMm)} mm`], ['Minimum clearance', `${fmt(summary.minimumClearanceMm)} mm`], ['Closest column', summary.minimumClearanceColumnId ?? '—'], ['RMS line error', `${fmt(summary.rmsLineErrorMm)} mm`], ['Max line error', `${fmt(summary.maximumAbsoluteLineErrorMm)} mm`], ['HF Yaw Rate RMS', `${fmt(summary.hfYawRateRmsRadS,3)} rad/s`], ['Line lost', `${fmt(summary.totalLineLossDurationS)} s`]];
  const root = el('summary'); root.replaceChildren(...rows.map(([label, value]) => { const item = document.createElement('div'); item.className = 'summary-item'; const l = document.createElement('span'), v = document.createElement('strong'); l.textContent = label; v.textContent = value; item.append(l, v); return item; }));
  el<HTMLButtonElement>('download').disabled = false;
}
function finish() { if (!state || state.status === 'running' || !activeSpec) return; const c = activeSpec, summary = simulationSummary(state); lastSpec = c; last = { conditions: { schemaVersion: 1, engineVersion: SIMULATION_ENGINE_VERSION, chassisId: c.chassisKey, boardId: c.boardKey, lineWidthMm: c.lineWidthMm, turnRadiusMm: c.turnRadiusMm, initialPose: c.initialPose, config: c.config, chassisConfig: c.chassis, boardConfig: c.board }, summary }; showSummary(summary);setBusy(false);render();if(recorder?.state==='recording')recorder.stop(); }
function stopSchedulers() { generation++; cancelAnimationFrame(realtimeHandle); }
function trackedStep(){if(!state)return;stepSimulation(state);poseTrail.push({...state.pose});while(poseTrail.length>51)poseTrail.shift();}
async function fastRun() {
  try { stopSchedulers(); const fresh = freshState(), myGeneration = generation; activeSpec = fresh.c; state = fresh.simulation;poseTrail=[{...state.pose}]; last = null; setBusy(true); render();
    while (state.status === 'running' && generation === myGeneration) { for (let i = 0; i < 2000 && state.status === 'running'; i++)trackedStep(); render(); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
    if (generation === myGeneration) finish();
  } catch (error) { fail(error); }
}
function realtimeRun(record=false) {
  try { stopSchedulers(); const fresh = freshState(lastSpec ?? conditions()), myGeneration = generation; activeSpec = fresh.c; state = fresh.simulation;poseTrail=[{...state.pose}]; setBusy(true); lastWall = performance.now(); wallAccumulator = 0; render();if(record)startRecorder();
    const frame = (now: number) => { if (generation !== myGeneration || !state) return; wallAccumulator += Math.min(0.1, (now - lastWall) / 1000); lastWall = now; while (wallAccumulator >= state.config.controlDtS && state.status === 'running') {trackedStep(); wallAccumulator -= state.config.controlDtS; } render(); if (state.status === 'running') realtimeHandle = requestAnimationFrame(frame); else finish(); };
    realtimeHandle = requestAnimationFrame(frame);
  } catch (error) { fail(error); }
}
function startRecorder(){const canvas=el<HTMLCanvasElement>('run-canvas'),capture=(canvas as HTMLCanvasElement&{captureStream?:(fps?:number)=>MediaStream}).captureStream;if(!capture||typeof MediaRecorder==='undefined')throw new Error('This browser does not support WebM canvas recording');const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));videoChunks=[];recorder=new MediaRecorder(capture.call(canvas,30),mime?{mimeType:mime,videoBitsPerSecond:2_500_000}:{videoBitsPerSecond:2_500_000});recorder.ondataavailable=e=>{if(e.data.size)videoChunks.push(e.data)};recorder.onstop=()=>{const blob=new Blob(videoChunks,{type:recorder?.mimeType||'video/webm'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`line-follower-replay-${Date.now()}.webm`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);recorder=null;videoChunks=[];};recorder.start(1000);}
function fail(error: unknown) { stopSchedulers();if(recorder?.state==='recording')recorder.stop(); setBusy(false); el('run-error').textContent = error instanceof Error ? error.message : String(error); el('run-error').hidden = false; }
el('fast-run').addEventListener('click', () => { el('run-error').hidden = true; void fastRun(); }); el('replay').addEventListener('click', () => { el('run-error').hidden = true; realtimeRun(); });
el('record-video').addEventListener('click',()=>{el('run-error').hidden=true;realtimeRun(true);});
el('cancel').addEventListener('click', () => { stopSchedulers(); if (state) { cancelSimulation(state); finish(); } });
for (const id of ['chassis','board','width','radius','start-x','start-y','heading','duration','noise-severity','noise-seed','speed','wheel-limit','kp','ki','kd','max-yaw','acceleration','deceleration','motor-delay']) el(id).addEventListener('change', () => { if (state?.status === 'running') return; try { state = freshState().simulation;poseTrail=[{...state.pose}];render(); } catch (error) { fail(error); } });
el('download').addEventListener('click', () => { if (!last) return; const blob = new Blob([JSON.stringify(last, null, 2)], { type: 'application/json' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `line-follower-run-${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href); });
el('download-board-svg').addEventListener('click',()=>{try{const spec=conditions(),blob=new Blob([boardSvg(spec.board)],{type:'image/svg+xml;charset=utf-8'}),link=document.createElement('a'),safe=spec.board.name.replace(/[^A-Za-z0-9_-]+/g,'_');link.href=URL.createObjectURL(blob);link.download=`${safe}-${spec.lineWidthMm}mm-line-${spec.turnRadiusMm}mm-radius.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}catch(error){fail(error);}});
new ResizeObserver(render).observe(el('run-canvas')); window.addEventListener('resize', render); render();
