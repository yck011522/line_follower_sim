import './style.css';
import './sweep.css';
import t90Yaml from '../../configs/chassis/T90L91.yaml?raw';
import t100Yaml from '../../configs/chassis/T100L101.yaml?raw';
import elleYaml from '../../configs/boards/board_4_3_elle.yaml?raw';
import { parseChassis } from '../core/config';
import { parseBoard } from '../core/board-config';
import { SIMULATION_ENGINE_VERSION } from '../core/simulation';
import type { SimulationConfig } from '../core/simulation';
import { expandSweep, inclusiveRange, METRIC_LABELS, metricValue, robustClearanceCandidate, SWEEP_LABELS } from '../core/sweep';
import type { SweepMetric, SweepParameter, SweepResult, SweepValues } from '../core/sweep';
import type { SweepWorkerRequest, SweepWorkerResponse } from './sweep.worker';

const chassisPresets = { T90L91: parseChassis(t90Yaml), T100L101: parseChassis(t100Yaml) };
type ChassisKey = keyof typeof chassisPresets;
const boardDesign = parseBoard(elleYaml);
const parameters = Object.keys(SWEEP_LABELS) as SweepParameter[];
const ROBUSTNESS_STORE = 'line-follower-robustness-studies-v3';

document.querySelector('#app')!.innerHTML = `
<header class="site-header"><a class="brand" href="./"><span class="brand-mark">↱</span> LINE FOLLOWER <span class="brand-light">/ SIM</span></a><nav class="studio-nav"><a href="./chassis.html">Chassis</a><a href="./board.html">Game boards</a><a href="./observe.html">Sensors</a><a href="./simulate.html">Run</a><a href="./sweep.html" aria-current="page">Sweeps</a></nav></header>
<main><section class="page-heading"><div><p class="eyebrow">SIMULATION WORKSPACE / BATCH ANALYSIS</p><h1>Sweep studio<span>.</span></h1><p class="intro">Find broad, safe controller regions rather than a single lucky setting.</p></div><span class="units-pill">ELLE · 200 s PER TRIAL</span></section>
<div class="sweep-layout"><aside class="inspector sweep-controls">
  <div class="sweep-section"><h3>Fixed conditions</h3><label>Chassis<select id="sweep-chassis"><option>T90L91</option><option>T100L101</option></select></label><label>Board<input value="Elle" disabled></label><div class="range-row"><label><span>Start X</span><input id="start-x" type="number" value="240"></label><label><span>Start Y</span><input id="start-y" type="number" value="120"></label><label><span>Heading°</span><input id="heading" type="number" value="0"></label></div><label>Duration (seconds)<input id="duration" type="number" value="200" min="0.02"></label></div>
  <div class="sweep-section"><h3>Turn radius (mm)</h3><div class="range-row"><label><span>Start</span><input id="radius-start" type="number" value="10"></label><label><span>Stop</span><input id="radius-stop" type="number" value="120"></label><label><span>Step</span><input id="radius-step" type="number" value="10"></label></div></div>
  <div class="sweep-section"><h3>Line width (mm)</h3><div class="range-row"><label><span>Start</span><input id="width-start" type="number" value="14"></label><label><span>Stop</span><input id="width-stop" type="number" value="26"></label><label><span>Step</span><input id="width-step" type="number" value="2"></label></div></div>
  <div class="sweep-section"><h3>Kp</h3><div class="range-row"><label><span>Start</span><input id="kp-start" type="number" value="0.1" step="0.1"></label><label><span>Stop</span><input id="kp-stop" type="number" value="0.8" step="0.1"></label><label><span>Step</span><input id="kp-step" type="number" value="0.1" step="0.1"></label></div></div>
  <div class="sweep-section"><div><strong id="trial-count">672 trials</strong><p class="run-note">Other controller values use the Run studio defaults.</p><p id="cache-status" class="run-note">Checking local result cache…</p></div><div class="progress-track"><i id="progress-bar"></i></div><span id="progress-text" class="run-note">Ready</span><div class="sweep-actions"><button id="start-sweep" class="button primary">Run parameter sweep</button><button id="cancel-sweep" class="button secondary" disabled>Cancel</button><button id="download-sweep" class="button secondary" disabled>Download JSON</button></div><p id="sweep-error" class="config-error" hidden></p></div>
</aside><section class="heat-panel"><div class="heat-toolbar"><label>X axis<select id="x-axis"></select></label><label>Y axis<select id="y-axis"></select></label><label id="slice-label">Slice<select id="slice-value"></select></label><label>Displayed result<select id="heat-metric"></select></label></div><div class="heatmap-wrap"><p id="axis-title" class="axis-title"></p><table id="heatmap" class="heatmap"></table></div><div class="heat-legend"><span id="poor-label">Lower</span><i class="gradient"></i><span id="good-label">Higher is better</span><span>Dark red = failed</span></div><div id="candidate" class="candidate">Run the sweep to calculate a robust interior candidate.</div><div id="cell-detail" class="cell-detail">Select a completed cell to inspect its full summary and open it in the Run studio.</div></section></div>
<section class="board-note"><span class="tiny-tag">ROBUSTNESS RULE</span><p>The suggested setting maximizes the worst minimum-clearance result across its 3 × 3 × 3 neighborhood. Boundary settings are excluded because their behavior beyond the tested range is unknown.</p></section></main>`;

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const n = (id: string) => Number(el<HTMLInputElement>(id).value);
const option = (value: string, label: string) => { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; };
for (const [id, selected] of [['x-axis','turnRadiusMm'],['y-axis','kp']] as const) {
  const select = el<HTMLSelectElement>(id); for (const parameter of parameters) select.append(option(parameter, SWEEP_LABELS[parameter])); select.value = selected;
}
for (const metric of Object.keys(METRIC_LABELS) as SweepMetric[]) el<HTMLSelectElement>('heat-metric').append(option(metric, METRIC_LABELS[metric]));
interface RunContext { chassisKey: ChassisKey; durationS: number; pose: { x:number; y:number; headingDeg:number }; simulation: SimulationConfig; values: SweepValues }
let workers: Worker[] = [], results: SweepResult[] = [], sweepValues: SweepValues | null = null, selected: SweepResult | null = null, runContext: RunContext | null = null;
interface CacheRecord { key:string; condition:unknown; result:SweepResult }
let cacheAvailable=false, pendingCache:CacheRecord[]=[]; let cacheWriteQueue=Promise.resolve();

function canonical(value:unknown):string {
  if(value === null || typeof value !== 'object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object=value as Record<string,unknown>; return `{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}
async function digest(value:unknown):Promise<string> { const bytes=new TextEncoder().encode(canonical(value)),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join(''); }
function pointId(point:{turnRadiusMm:number;lineWidthMm:number;kp:number}){return `${point.turnRadiusMm}|${point.lineWidthMm}|${point.kp}`;}
function robustnessTested(point:{turnRadiusMm:number;lineWidthMm:number;kp:number}) { try { const saved=JSON.parse(localStorage.getItem(ROBUSTNESS_STORE)??'[]') as Array<{chassis:string;board:string;turnRadiusMm:number;lineWidthMm:number;kp:number}>; const chassis=runContext?.chassisKey??el<HTMLSelectElement>('sweep-chassis').value; return saved.some(s=>s.chassis===chassis&&s.board==='elle'&&s.turnRadiusMm===point.turnRadiusMm&&s.lineWidthMm===point.lineWidthMm&&s.kp===point.kp); } catch { return false; } }
async function lookupCache(keys:string[]):Promise<Record<string,SweepResult>> { const response=await fetch('/api/sweep-cache/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys})});if(!response.ok)throw new Error('Local cache unavailable');cacheAvailable=true;const body=await response.json() as {entries:Record<string,SweepResult>};return body.entries; }
async function flushCache(){if(!cacheAvailable||!pendingCache.length)return;const entries=pendingCache.splice(0);cacheWriteQueue=cacheWriteQueue.then(async()=>{const response=await fetch('/api/sweep-cache/store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries})});if(!response.ok)throw new Error('Could not update local cache');}).catch(error=>{cacheAvailable=false;el('cache-status').textContent=`Local cache write failed: ${error instanceof Error?error.message:String(error)}`;});await cacheWriteQueue;}

function readValues(): SweepValues { return {
  turnRadiusMm: inclusiveRange(n('radius-start'), n('radius-stop'), n('radius-step')),
  lineWidthMm: inclusiveRange(n('width-start'), n('width-stop'), n('width-step')),
  kp: inclusiveRange(n('kp-start'), n('kp-stop'), n('kp-step')),
}; }
function updateCount() { try { const count = expandSweep(readValues()).length; el('trial-count').textContent = `${count.toLocaleString()} trials`; el('sweep-error').hidden = true; } catch (error) { showError(error); } }
function remainingParameter(): SweepParameter { const x = el<HTMLSelectElement>('x-axis').value as SweepParameter, y = el<HTMLSelectElement>('y-axis').value as SweepParameter; return parameters.find(parameter => parameter !== x && parameter !== y)!; }
function updateSliceOptions() {
  if (!sweepValues) sweepValues = readValues();
  const parameter = remainingParameter(), select = el<HTMLSelectElement>('slice-value'), previous = Number(select.value);
  select.replaceChildren(...sweepValues[parameter].map(value => option(String(value), String(value))));
  if (sweepValues[parameter].includes(previous)) select.value = String(previous); else select.value = String(sweepValues[parameter][Math.floor(sweepValues[parameter].length / 2)]);
  el('slice-label').firstChild!.textContent = `${SWEEP_LABELS[parameter]} slice`;
}
function enforceDistinct(changed: 'x'|'y') {
  const x = el<HTMLSelectElement>('x-axis'), y = el<HTMLSelectElement>('y-axis');
  if (x.value === y.value) (changed === 'x' ? y : x).value = parameters.find(parameter => parameter !== (changed === 'x' ? x.value : y.value))!;
  updateSliceOptions(); renderHeatmap();
}
function color(score: number): string {
  const stops = score < .5 ? [[188,76,67],[241,211,109],score*2] : [[241,211,109],[43,155,120],(score-.5)*2];
  const [a,b,t] = stops as [number[],number[],number]; return `rgb(${a.map((value,index) => Math.round(value + (b[index]-value)*t)).join(',')})`;
}
function resultKey(result: SweepResult, x: SweepParameter, y: SweepParameter, slice: SweepParameter, sliceValue: number) { return result[slice] === sliceValue ? `${result[x]}|${result[y]}` : ''; }
function renderHeatmap() {
  const x = el<HTMLSelectElement>('x-axis').value as SweepParameter, y = el<HTMLSelectElement>('y-axis').value as SweepParameter, slice = remainingParameter();
  const metric = el<HTMLSelectElement>('heat-metric').value as SweepMetric, sliceValue = Number(el<HTMLSelectElement>('slice-value').value);
  const values = sweepValues ?? readValues(), xs = values[x], ys = [...values[y]].reverse();
  el('axis-title').textContent = `${SWEEP_LABELS[y]} ↑  ·  ${SWEEP_LABELS[x]} →  ·  ${SWEEP_LABELS[slice]} = ${sliceValue}`;
  const visible = results.filter(result => result[slice] === sliceValue), byCell = new Map(visible.map(result => [resultKey(result,x,y,slice,sliceValue), result]));
  const numeric = visible.filter(result => result.summary.status === 'completed').map(result => metricValue(result,metric)).filter((value): value is number => value !== null && Number.isFinite(value));
  const min = numeric.length ? Math.min(...numeric) : 0, max = numeric.length ? Math.max(...numeric) : 1, higherBetter = metric === 'minimumClearanceMm';
  el('poor-label').textContent = higherBetter ? 'Less clearance' : 'More error'; el('good-label').textContent = higherBetter ? 'More clearance' : 'Less error';
  const table = el<HTMLTableElement>('heatmap'); table.replaceChildren();
  const head = document.createElement('tr'); head.append(document.createElement('th')); for (const xv of xs) { const th=document.createElement('th'); th.textContent=String(xv); head.append(th); } table.append(head);
  for (const yv of ys) { const row=document.createElement('tr'), th=document.createElement('th'); th.textContent=String(yv); row.append(th);
    for (const xv of xs) { const cell=document.createElement('td'), result=byCell.get(`${xv}|${yv}`); if (!result) { cell.className='empty'; cell.textContent='—'; }
      else if (result.summary.status !== 'completed') { cell.className='failed'; cell.textContent=result.summary.status.replace('_',' '); cell.title=`${result.summary.status} at ${result.summary.actualDurationS.toFixed(2)} s`; cell.onclick=()=>selectResult(result); }
      else { const value=metricValue(result,metric); if (value === null) { cell.className='empty'; cell.textContent='—'; } else { let normalized=max===min?1:(value-min)/(max-min); if(!higherBetter && max!==min)normalized=1-normalized; cell.style.background=color(normalized); const tested=robustnessTested(result); cell.textContent=`${value.toFixed(2)}${tested?' R':''}`; cell.title=`${METRIC_LABELS[metric]}: ${value.toFixed(4)}${tested?' · robustness tested':''}`; cell.onclick=()=>selectResult(result); if(tested)cell.classList.add('robust-tested'); if(selected===result)cell.classList.add('selected'); } }
      row.append(cell); } table.append(row); }
}
function selectResult(result: SweepResult) { selected=result; renderHeatmap(); const s=result.summary, context=runContext;
  const query=new URLSearchParams({ chassis:context?.chassisKey ?? el<HTMLSelectElement>('sweep-chassis').value, board:'elle', width:String(result.lineWidthMm), radius:String(result.turnRadiusMm), kp:String(result.kp), duration:String(context?.durationS ?? n('duration')), x:String(context?.pose.x ?? n('start-x')), y:String(context?.pose.y ?? n('start-y')), heading:String(context?.pose.headingDeg ?? n('heading')) });
  const robustQuery=new URLSearchParams({chassis:query.get('chassis')!,width:String(result.lineWidthMm),radius:String(result.turnRadiusMm),kp:String(result.kp),duration:'100'});
  el('cell-detail').innerHTML=`<strong>Selected:</strong> radius ${result.turnRadiusMm} mm · width ${result.lineWidthMm} mm · Kp ${result.kp}${robustnessTested(result)?' · <strong>robustness tested</strong>':''}<br><strong>Status:</strong> ${s.status} · <strong>minimum clearance:</strong> ${s.minimumClearanceMm?.toFixed(3) ?? '—'} mm · <strong>RMS error:</strong> ${s.rmsLineErrorMm?.toFixed(3) ?? '—'} mm · <strong>maximum error:</strong> ${s.maximumAbsoluteLineErrorMm?.toFixed(3) ?? '—'} mm<br><a class="text-button" href="./simulate.html?${query}" target="_blank">Open these conditions in Run studio ↗</a> · <a class="text-button" href="./robustness.html?${robustQuery}">Test noise robustness →</a>`;
}
function fixedSimulation(): SimulationConfig { return { durationS:n('duration'), controlDtS:.02, lineLossGraceS:1, maxMotionSubstepMm:2, maxRotationSubstepRad:Math.PI/90, motorOutputDelayS:.05, controller:{ targetSpeedMmS:120, accelerationMmS2:300, decelerationMmS2:2000, kp:.08, ki:0, kd:.002, integralLimitMmS:100, maxYawRateRadS:3, maxWheelSpeedMmS:250 } }; }
const conditionControlIds=['sweep-chassis','start-x','start-y','heading','duration','radius-start','radius-stop','radius-step','width-start','width-stop','width-step','kp-start','kp-stop','kp-step'];
function setRunning(value:boolean){el<HTMLButtonElement>('start-sweep').disabled=value;el<HTMLButtonElement>('cancel-sweep').disabled=!value;for(const id of conditionControlIds)el<HTMLInputElement|HTMLSelectElement>(id).disabled=value;}
function showError(error:unknown){el('sweep-error').textContent=error instanceof Error?error.message:String(error);el('sweep-error').hidden=false;setRunning(false);}
async function startSweep(){ try {
  for(const active of workers)active.terminate();workers=[];pendingCache=[];sweepValues=readValues();const points=expandSweep(sweepValues);if(points.length>10_000)throw new Error('Limit a browser sweep to 10,000 trials');results=[];selected=null;updateSliceOptions();renderHeatmap();setRunning(true);el('sweep-error').hidden=true;el('progress-text').textContent=`Checking ${points.length.toLocaleString()} conditions…`;el<HTMLElement>('progress-bar').style.width='0%';el<HTMLButtonElement>('download-sweep').disabled=true;
  const chassisKey=el<HTMLSelectElement>('sweep-chassis').value as ChassisKey,simulation=fixedSimulation(),pose={x:n('start-x'),y:n('start-y'),headingDeg:n('heading')};runContext={chassisKey,durationS:simulation.durationS,pose,simulation,values:sweepValues};
  const keyed=await Promise.all(points.map(async point=>{const fullCondition={engineVersion:SIMULATION_ENGINE_VERSION,chassis:chassisPresets[chassisKey],boardDesign,pose,simulation:{...simulation,controller:{...simulation.controller,kp:point.kp}},lineWidthMm:point.lineWidthMm,turnRadiusMm:point.turnRadiusMm};return{point,key:await digest(fullCondition),condition:{engineVersion:SIMULATION_ENGINE_VERSION,chassis:chassisKey,board:'elle',pose,durationS:simulation.durationS,controlDtS:simulation.controlDtS,point}};}));
  let cached:Record<string,SweepResult>={};try{cached=await lookupCache(keyed.map(item=>item.key));el('cache-status').textContent='Local cache active · data/sweep-cache.json.gz';}catch{cacheAvailable=false;el('cache-status').textContent='Repository cache unavailable · results stay in memory and can be downloaded';}
  const keyByPoint=new Map(keyed.map(item=>[pointId(item.point),item])),missing=[] as typeof points;for(const item of keyed){const hit=cached[item.key];if(hit)results.push(hit);else missing.push(item.point);}
  renderHeatmap();el<HTMLElement>('progress-bar').style.width=`${results.length/points.length*100}%`;
  const finishAll=async()=>{await flushCache();await cacheWriteQueue;setRunning(false);el('progress-text').textContent=`Complete · ${points.length.toLocaleString()} trials · ${keyed.length-missing.length} reused`;el<HTMLButtonElement>('download-sweep').disabled=false;renderHeatmap();const robust=robustClearanceCandidate(results,runContext!.values);el('candidate').textContent=robust?`Robust interior candidate: radius ${robust.result.turnRadiusMm} mm, width ${robust.result.lineWidthMm} mm, Kp ${robust.result.kp}. Its worst minimum clearance across the 27 neighboring settings is ${robust.neighborhoodMinimumMm.toFixed(2)} mm.`:'No fully successful interior neighborhood was found.';};
  if(!missing.length){await finishAll();return;}
  const workerCount=Math.min(4,Math.max(1,navigator.hardwareConcurrency||2),missing.length),chunks=Array.from({length:workerCount},()=>[] as typeof points);missing.forEach((point,index)=>chunks[index%workerCount].push(point));let finishedWorkers=0;
  for(const chunk of chunks){const worker=new Worker(new URL('./sweep.worker.ts',import.meta.url),{type:'module'});workers.push(worker);worker.onmessage=(event:MessageEvent<SweepWorkerResponse>)=>{const message=event.data;if(message.type==='progress'){results.push(message.result);const item=keyByPoint.get(pointId(message.result))!;pendingCache.push({key:item.key,condition:item.condition,result:message.result});if(pendingCache.length>=16)void flushCache();const completed=results.length;el('progress-text').textContent=`${completed.toLocaleString()} / ${points.length.toLocaleString()} · ${workerCount} workers`;el<HTMLElement>('progress-bar').style.width=`${completed/points.length*100}%`;if(completed%16===0||completed===points.length)renderHeatmap();}else if(message.type==='complete'){finishedWorkers++;if(finishedWorkers===workerCount)void finishAll();}else{for(const active of workers)active.terminate();showError(message.message);}};worker.onerror=event=>{for(const active of workers)active.terminate();showError(event.message);};const request:SweepWorkerRequest={chassis:chassisPresets[chassisKey],boardDesign,initialPose:{x:pose.x,y:pose.y,heading:pose.headingDeg*Math.PI/180},simulation,points:chunk};worker.postMessage(request);}
}catch(error){showError(error);} }
function invalidateResults(){if(results.length){results=[];selected=null;runContext=null;el<HTMLButtonElement>('download-sweep').disabled=true;el('candidate').textContent='Run the sweep to calculate a robust interior candidate.';el('cell-detail').textContent='Select a completed cell to inspect its full summary and open it in the Run studio.';}renderHeatmap();}
for(const id of ['radius-start','radius-stop','radius-step','width-start','width-stop','width-step','kp-start','kp-stop','kp-step'])el(id).addEventListener('input',()=>{sweepValues=null;updateCount();invalidateResults();});
for(const id of ['sweep-chassis','start-x','start-y','heading','duration'])el(id).addEventListener('change',invalidateResults);
el('x-axis').addEventListener('change',()=>enforceDistinct('x'));el('y-axis').addEventListener('change',()=>enforceDistinct('y'));el('slice-value').addEventListener('change',renderHeatmap);el('heat-metric').addEventListener('change',renderHeatmap);
el('start-sweep').addEventListener('click',()=>{void startSweep();});el('cancel-sweep').addEventListener('click',()=>{for(const worker of workers)worker.terminate();workers=[];void flushCache();setRunning(false);el('progress-text').textContent=`Cancelled · ${results.length.toLocaleString()} results retained`;el<HTMLButtonElement>('download-sweep').disabled=results.length===0;renderHeatmap();});
el('download-sweep').addEventListener('click',()=>{if(!runContext)return;const context=runContext,bundle={schemaVersion:1,engineVersion:SIMULATION_ENGINE_VERSION,sweep:{board:'elle',chassis:context.chassisKey,values:context.values,initialPose:context.pose,simulation:context.simulation},configurationSnapshots:{chassis:chassisPresets[context.chassisKey],board:boardDesign},results};const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`elle-sweep-${Date.now()}.json`;link.click();URL.revokeObjectURL(link.href);});
updateCount();sweepValues=readValues();updateSliceOptions();renderHeatmap();
window.addEventListener('storage',renderHeatmap);window.addEventListener('pageshow',renderHeatmap);
fetch('/api/sweep-cache/status').then(async response=>{if(!response.ok)throw new Error();const status=await response.json() as {entries:number};cacheAvailable=true;el('cache-status').textContent=`Local repository cache active · ${status.entries.toLocaleString()} saved results`;}).catch(()=>{el('cache-status').textContent='Static mode · results stay in memory and can be downloaded';});
