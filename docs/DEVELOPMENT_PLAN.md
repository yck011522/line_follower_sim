# Development status and remaining scope

## Objective

Use one deterministic 2D model to compare chassis geometry, board geometry, and
line-following controller settings while measuring clearance from column centres.
All geometry uses millimetres and the control loop runs at 50 Hz.

## Implemented

- Two validated YAML chassis configurations with explicit concave collision polygons,
  wheel geometry, and eight ordered optical sensors.
- Three editable tile-based boards with parametric line width and corner radius.
- Analytical point sensing against finite line segments and circular arcs.
- Signed column-centre clearance against the transformed chassis polygon; overlap
  remains a continuous negative metric and does not stop a run.
- Exact differential-drive integration with bounded collision substeps.
- A two-level PID controller with speed ramps, limits, and anti-windup.
- Fast deterministic runs and wall-clock replay from the same simulation core.
- Incremental summary metrics without stored timestep trajectories.
- Three-parameter browser sweeps across up to four Web Workers.
- Selectable heat-map axes, slices, metrics, and a local neighbourhood robustness score.
- A content-addressed local sweep cache in `data/sweep-cache.json.gz`.
- Deterministic sensor-edge bias and turn-dependent forward/yaw slip.
- Multi-seed robustness studies, clearance-versus-severity charts, adjustable margin
  qualification, and saved candidate comparisons.
- Static builds suitable for GitHub Pages, with memory/JSON fallback when writes are unavailable.

## Current architecture

```text
configs/chassis/       Versioned chassis YAML
configs/boards/        Versioned board YAML
data/                  Content-addressed aggregate sweep cache
src/core/              DOM-independent geometry, control, dynamics, and simulation
src/web/               Page controllers, Canvas rendering, sweep and robustness workers
tests/                 Geometry, control, noise, simulation, sweep, and browser checks
vite-sweep-cache.ts    Local development-only cache API
```

The simulation core has no Canvas or DOM dependency. Rendering never advances time
or consumes observations. Fast runs, replay, and sweep workers call the same fixed-step
functions. `SIMULATION_ENGINE_VERSION` is part of persisted condition identity and
must be bumped whenever numerical behavior changes.

## Deliberately out of scope

- Finite optical footprints and hardware-calibrated channel bias distributions.
- Inertia, motor dynamics, battery effects, and measured actuator limits.
- Three-way board tiles and branch-selection policy.
- Reverse recovery or line reacquisition after complete sensor loss.
- A command-line batch runner and formal confidence-bound reporting.
- Automatic Git commits or writes from static GitHub Pages.

Add these only when hardware evidence or a concrete experiment requires them. The
current ideal model is intended for relative geometry/controller comparisons, not a
claim of physical fidelity.

## Validation expectations

Changes to geometry need analytical boundary tests. Changes to motion need straight,
pivot, and circular-arc examples. Controller or metric changes need deterministic
closed-loop tests and an engine-version bump. UI changes should retain a browser test
covering the permanent pages, cache reuse, heat-map direction, and mobile layout.

