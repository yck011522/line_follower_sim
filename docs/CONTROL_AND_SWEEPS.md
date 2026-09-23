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
limits, an integral bound, and saturation-aware anti-windup. During complete sensor
loss, the estimator holds its last valid error and continues control for a one-second
grace interval. Detection recovery resumes normal estimation; continuous loss at the
limit terminates the trial.

## Shared deterministic core

`src/core/simulation.ts` owns fixed 20 ms control ticks and has no browser or Canvas
dependency. Every tick observes, controls, integrates, collision-checks, and updates
summary metrics in a fixed order. Fast runs, wall-clock replay, and sweep workers all
call this same core. Drawing never advances simulation state.

Motion uses exact constant-wheel-speed integration. Collision checks subdivide a
control interval so translation is at most 2 mm and rotation at most 2° per check.
Controller wheel commands pass through a configurable transport delay before motion.
The browser studios default to 0.05 seconds and interpolate at the delay boundary so
the delay is represented even though the control timestep is 0.02 seconds.

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
selected metric. Negative clearance represents overlap and remains a completed
numerical result; line-loss or cancelled runs are dark red.

Each cell can open its exact condition in the Run studio. Refining bounds or halving
step sizes reuses overlapping cache entries.

## Robustness heuristic

For every interior point, the simulator finds the minimum clearance across that point
and its immediate neighbors on all three axes. It recommends the point with the best
worst-case value across this 3 × 3 × 3 neighborhood. This favors a plateau over an
isolated peak.

Boundary points are excluded because behavior just outside the tested range is
unknown. The result is a local clearance heuristic. A selected cell can be sent to
the robustness studio for deterministic noise replicates.

The robustness study sweeps a severity scale across multiple seeds. Severity 1.0
means bounded, correlated sensor-edge offsets (±1.5 mm total), forward slip (0–3%),
and turn-dependent yaw variation (up to ±5%). It records the worst, median, and best
minimum clearance among completed trials at each severity; terminated trials are
reported separately. Qualified severity is the highest tested level
whose worst clearance, and every lower tested level, meet the adjustable engineering
margin without line loss. Candidate comparisons keep these aggregate curves, so
changing the margin is immediate and requires no rerun.

## Persistent local cache

The Vite development server exposes a same-origin cache API backed by
`data/sweep-cache.json.gz`. Each SHA-256 key covers:

- `SIMULATION_ENGINE_VERSION`.
- Complete chassis and board snapshots.
- Initial pose, duration, controller, and numerical settings.
- The swept line width, turn radius, and `Kp`.

A sweep performs one batch lookup, displays hits immediately, and sends only misses
to workers. New summaries are written in batches, including completed work before
cancellation. The gzip file contains compact condition metadata and aggregate
results, never trajectories. Noise trials use the same cache API and include
severity and seed in their content-derived keys.

The cache is an ordinary tracked repository file. Sharing changes requires an
explicit Git commit. Numerical behavior changes must bump `SIMULATION_ENGINE_VERSION`,
which prevents stale entries from matching without deleting historical data.

The API exists only under `npm run dev` and `start-visualizer.cmd`. Static deployments
such as GitHub Pages fall back to memory and JSON downloads.

## Possible extensions

- Confidence bounds based on a larger, explicitly justified seed count.
- Additional sweep axes such as speed, `Ki`, and `Kd`.
- A generic experiment-file importer or Node.js command-line runner.
- Analogue sensor footprints, channel bias, line reacquisition, and branch policy.

