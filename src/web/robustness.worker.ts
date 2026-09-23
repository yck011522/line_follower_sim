import type { Board } from '../core/board-config';
import type { Chassis } from '../core/chassis';
import type { Pose } from '../core/geometry';
import { createSimulation, runToCompletion } from '../core/simulation';
import type { SimulationConfig, SimulationSummary } from '../core/simulation';
import { resolveBoard } from '../core/sensing';

export interface RobustnessJob { severity: number; seed: number; key: string }
export interface RobustnessTrial extends RobustnessJob { summary: SimulationSummary }
export interface RobustnessWorkerRequest { chassis: Chassis; boardDesign: Board; initialPose: Pose; lineWidthMm: number; turnRadiusMm: number; simulation: SimulationConfig; jobs: RobustnessJob[] }
export type RobustnessWorkerResponse = { type:'progress'; trial:RobustnessTrial } | { type:'complete' } | { type:'error'; message:string };

self.onmessage = (event: MessageEvent<RobustnessWorkerRequest>) => {
  const request = event.data;
  try {
    const board = resolveBoard(request.boardDesign, { lineWidthMm:request.lineWidthMm, turnRadiusMm:request.turnRadiusMm });
    for (const job of request.jobs) {
      const config: SimulationConfig = { ...request.simulation, noise:{ severity:job.severity, seed:job.seed } };
      const summary = runToCompletion(createSimulation(request.chassis, board, request.initialPose, config));
      self.postMessage({ type:'progress', trial:{ ...job, summary } } satisfies RobustnessWorkerResponse);
    }
    self.postMessage({ type:'complete' } satisfies RobustnessWorkerResponse);
  } catch (error) { self.postMessage({ type:'error', message:error instanceof Error?error.message:String(error) } satisfies RobustnessWorkerResponse); }
};
