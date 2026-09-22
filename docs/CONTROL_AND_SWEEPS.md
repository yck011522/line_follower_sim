# Controller, sweeps, robustness, and caching

## Controller

The observation level computes a lateral line estimate from the eight binary sensor
locations. Positive error means the line is to the chassis left. PID converts that
error into positive counterclockwise yaw, then differential-drive kinematics combine
yaw with ramped forward speed:

```text
left_speed  = forward_speed - yaw_rate * track_width / 2
right_speed = forward_speed + yaw_rate * track_width / 2
```

The controller has separate acceleration/deceleration limits, yaw and wheel-speed
limits, an integral bound, and saturation-aware anti-windup. Complete sensor loss
ramps speed toward zero and fails the trial after the configured grace interval.

## Shared deterministic core

`src/core/simulation.ts` owns fixed 20 ms control ticks and has no browser or Canvas
dependency. Every tick observes, controls, integrates, collision-checks, and updates
summary metrics in a fixed order. Fast runs, wall-clock replay, and sweep workers all
call this same core. Drawing never advances simulation state.

Motion uses exact constant-wheel-speed integration. Collision checks subdivide a
control interval so translation is at most 2 mm and rotation at most 2° per check.

## Parameter sweeps

The sweep studio runs Cartesian products across up to four Web Workers. Its default
Elle experiment uses 200 seconds per condition with:

- Turn radius: 10–120 mm by 10 mm.
- Line width: 14–26 mm by 2 mm.
- `Kp`: 0.1–0.8 by 0.1.

The 672 conditions retain only aggregate summaries. The heat map permits any two
parameters as axes, uses the third as a slice, and displays minimum clearance, RMS
line error, or maximum line error. Colors are normalized within the visible slice;
numeric values remain visible. Green represents the favorable direction for the
selected metric, and failed runs are dark red.

Each cell can open its exact condition in the Run studio. Refining bounds or halving
step sizes reuses overlapping cache entries.

## Robustness heuristic

For every interior point, the simulator finds the minimum clearance across that point
and its immediate neighbors on all three axes. It recommends the point with the best
worst-case value across this 3 × 3 × 3 neighborhood. This favors a plateau over an
isolated peak.

Boundary points are excluded because behavior just outside the tested range is
unknown. The result is a local clearance heuristic, not a statistical confidence
interval. Noise replicates would be required for completion rates or percentiles.

## Persistent local cache

The Vite development server exposes a same-origin cache API backed by
`data/sweep-cache.json`. Each SHA-256 key covers:

- `SIMULATION_ENGINE_VERSION`.
- Complete chassis and board snapshots.
- Initial pose, duration, controller, and numerical settings.
- The swept line width, turn radius, and `Kp`.

A sweep performs one batch lookup, displays hits immediately, and sends only misses
to workers. New summaries are written in batches, including completed work before
cancellation. The file contains compact condition metadata and aggregate results,
never trajectories.

The cache is an ordinary tracked repository file. Sharing changes requires an
explicit Git commit. Numerical behavior changes must bump `SIMULATION_ENGINE_VERSION`,
which prevents stale entries from matching without deleting historical data.

The API exists only under `npm run dev` and `start-visualizer.cmd`. Static deployments
such as GitHub Pages fall back to memory and JSON downloads.

## Possible extensions

- Seeded sensor-noise replicates and percentile summaries.
- Additional sweep axes such as speed, `Ki`, and `Kd`.
- A generic experiment-file importer or Node.js command-line runner.
- Analogue sensor footprints, channel bias, line reacquisition, and branch policy.
