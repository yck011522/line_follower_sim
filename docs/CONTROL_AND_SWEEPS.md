# Controller and parameter-sweep architecture

The first controller is deliberately split into two levels. The observation level
computes a lateral line estimate from the eight binary sensor locations. The motion
level turns that error into a requested yaw rate with PID and combines yaw with the
ramped forward speed to produce left and right wheel rim speeds.

Positive local `y` is left. A positive estimated error therefore requests positive
counterclockwise yaw. With drive-track width `b`:

```text
left_speed  = forward_speed - yaw_rate * b / 2
right_speed = forward_speed + yaw_rate * b / 2
```

The controller applies separate acceleration and deceleration limits, yaw-rate and
wheel-speed limits, an integral bound, and saturation-aware integral anti-windup.
If every sensor sees white, it ramps toward stopped and the trial fails after the
configured grace interval. Branch choice, reverse recovery, analogue footprints,
and sensor noise remain later extensions.

## One simulation core, two schedulers

`src/core/simulation.ts` owns fixed 20 ms control ticks and has no browser or Canvas
dependency. It always observes, controls, integrates, collision-checks, and updates
statistics in the same order. Fast mode executes many ticks before yielding to the
browser. Real-time mode executes those same ticks according to wall-clock animation
frames. Drawing never advances the simulation.

Motion uses exact constant-wheel-speed differential-drive integration. Collision
checks subdivide a control interval so translation is at most 2 mm and rotation is
at most 2 degrees per check. These are numerical settings in the trial conditions,
not hidden rendering settings.

## Sweep specification

The browser sweep studio now implements the initial Cartesian runner across up to four Web Workers.
It defaults to Elle, 200 seconds, radius 10–120 by 10 mm, line width 14–26 by 2 mm,
and Kp 0.1–0.8 by 0.1: 672 trials. Its heat map permits any two parameters as axes,
uses the remaining parameter as a slice, and displays clearance or either error
metric. Colors are normalized over the visible slice; every cell retains its numeric
value. Green represents the favorable direction for the chosen metric.

A future batch UI and Node runner should accept the same portable structure:

```yaml
schema_version: 1
name: baseline_grid
base_condition:
  chassis: T90L91
  board: loop
  initial_pose: { x_mm: 240, y_mm: 120, heading_deg: 0 }
  duration_s: 60
  control_dt_s: 0.02
axes:
  line_width_mm: { values: [10, 15, 20, 25] }
  turn_radius_mm: { start: 10, stop: 120, step: 10 }
  controller.target_speed_mm_s: { values: [80, 120, 160] }
  controller.kp: { values: [0.04, 0.08, 0.12] }
replicates:
  seeds: [0]
```

Expand the Cartesian product into ordinary, fully resolved condition rows before
running. Give each row a stable run ID computed from canonical conditions plus the
engine version. Reject duplicate axes, non-finite values, and batches above a user
visible size limit. A browser Web Worker can run the rows without blocking the page;
the Node runner can partition those same independent rows across CPU workers.

Each worker returns one aggregate summary per condition. It does not return a
trajectory. The table should keep status, duration, distance, minimum column
clearance and its time/column, RMS and maximum line error, line-loss durations,
collision information, and final pose. Derived comparison columns may include
completion rate and clearance/error percentiles across replicate seeds. Keep each
individual summary so distributions remain auditable; do not replace replicates
with averages alone.

Selecting any result sends its original resolved condition to real-time replay.
The replay recomputes the run and can compare its final summary with the stored one.
Noise is currently absent, but its future PRNG seed belongs to each condition row so
batch scheduling and rendering cannot change a result.

The current robustness candidate is clearance-specific. For every interior point,
it finds the minimum column clearance across the point and all immediate neighbors
on all three axes, then maximizes that worst case. This 3 × 3 × 3 erosion favors a
plateau over an isolated peak. Boundary points are excluded because the experiment
does not show how they behave just outside its range. This is a local robustness
heuristic, not a statistical confidence interval; future noise replicates should add
completion rates and lower clearance percentiles before hardware decisions.

## Local persistent result cache

The Vite development server exposes a same-origin cache API and stores its database
at `data/sweep-cache.json`. Each SHA-256 key covers the declared simulation engine
version and the fully resolved chassis, board, initial pose, numerics, controller,
and swept values. A sweep performs one batch lookup, renders cache hits immediately,
and sends only missing points to workers. Computed summaries are written in batches,
including partial progress when a run is cancelled. Overlapping sweeps therefore
reuse the intersection of their condition sets.

The file stores only condition metadata and aggregate summaries. It contains no
per-timestep trajectories. It is tracked as a normal repository artifact; sharing
updates remains an explicit Git commit. `SIMULATION_ENGINE_VERSION` must be increased
when numerical behavior changes, which invalidates earlier entries without deleting
them.

The API exists only under `npm run dev` and the Windows launcher. A static production
build detects the missing endpoint and falls back to memory plus JSON download. This
keeps GitHub Pages read-only and avoids presenting browser storage as repository data.
