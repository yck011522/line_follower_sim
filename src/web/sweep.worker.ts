import type { Board } from '../core/board-config';
import type { Chassis } from '../core/chassis';
import type { Pose } from '../core/geometry';
import type { SimulationConfig } from '../core/simulation';
import { createSimulation, runToCompletion } from '../core/simulation';
import { resolveBoard } from '../core/sensing';
import type { SweepPoint, SweepResult } from '../core/sweep';

export interface SweepWorkerRequest { chassis: Chassis; boardDesign: Board; initialPose: Pose; simulation: SimulationConfig; points: SweepPoint[] }
export type SweepWorkerResponse = { type: 'progress'; completed: number; total: number; result: SweepResult } | { type: 'complete'; total: number } | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<SweepWorkerRequest>) => {
  const request = event.data;
  try {
    request.points.forEach((point, index) => {
      const board = resolveBoard(request.boardDesign, { lineWidthMm: point.lineWidthMm, turnRadiusMm: point.turnRadiusMm });
      const config = { ...request.simulation, controller: { ...request.simulation.controller, kp: point.kp } };
      const summary = runToCompletion(createSimulation(request.chassis, board, request.initialPose, config));
      self.postMessage({ type: 'progress', completed: index + 1, total: request.points.length, result: { ...point, summary } } satisfies SweepWorkerResponse);
    });
    self.postMessage({ type: 'complete', total: request.points.length } satisfies SweepWorkerResponse);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) } satisfies SweepWorkerResponse);
  }
};
