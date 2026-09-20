# Development plan

## Purpose and scope

Compare two chassis configurations and answer:

1. Which chassis geometry, sensor placement, line width, and board turn radius
   allow reliable travel with adequate clearance from columns?
2. Which firmware control parameters let the robot follow the route at the
   requested speed, including acceleration and stopping?

Initial trials run for 60 simulated seconds with the forward command enabled.
The control period is 0.02 seconds (50 Hz); execution should run without real-time
delays when visualization is disabled. A full uninterrupted trial has 3,000 control
updates. Rendering is optional and independent of simulation timing.

This is initially an ideal planar kinematic model. The passive omni wheels impose
no rolling-direction constraint. Tire slip, inertia, motor dynamics, and optical
calibration are later refinements when hardware evidence makes them useful.

## Proposed implementation and folder structure

Implemented stack for stages 1 and 2: TypeScript compiled to JavaScript, with browser
UIs, Canvas 2D drawing, and Vite, suitable for static hosting on GitHub Pages. Both
chassis and three reference boards are implemented; stages 3–5 remain planned.
See [technology options](TECHNOLOGY.md) for the comparison and deployment details.

Keep the simulation core independent of browser APIs and rendering. Run batches
in a Web Worker in the browser, and reuse the same core in an optional Node.js
command-line runner. Keep controller code independent of true board pose. Use
YAML for editable inputs and JSON/CSV for saved configurations and results.

The following is a proposed layout; create modules only as their stages need them.

```text
line_follower_sim/
  README.md
  package.json
  tsconfig.json
  index.html
  chassis.html                   # Permanent geometry studio; root currently redirects here
  board.html                     # Separate board studio, linked from chassis page
  docs/
    DEVELOPMENT_PLAN.md
    CHASSIS_INPUTS.md
    TECHNOLOGY.md
    SIMULATION_RUNS.md
    BOARD_FORMAT.md
    SENSING_ARCHITECTURE.md
  references/                    # Supplied drawings and measured geometry
  configs/
    chassis/
      T90L91.yaml                 # Reviewed geometry
      T100L101.yaml               # Second chassis from its dimensioned drawing
    boards/
      board_4_3_loop.yaml
      board_4_3_elle.yaml
      board_4_3_snake.yaml
    controllers/
      pid.yaml
    experiments/
      baseline.yaml              # Config references, seed, initial pose, duration
  src/
    core/                        # No DOM, Canvas, or Node.js dependencies
      config.ts                  # Parse and validate versioned YAML
      geometry.ts                # Transforms, segment distances, polygon queries
      chassis.ts                 # Body, wheel, sensor, and collision geometry
      board-config.ts            # Board YAML validation and typed configuration
      board.ts                   # Tile transforms, analytical paths, column centers
      sensing.ts                 # Optical readings and deterministic noise
      dynamics.ts                # Differential-drive state integration
      collision.ts               # Signed clearance and collision queries
      controller.ts              # Sensor-only line following and speed ramps
      simulation.ts              # Fixed-time-step orchestration
      metrics.ts                 # Clearance, tracking, losses, and completion
    web/
      main.ts                    # Controls, file import/export, run/replay UI
      renderer.ts                # Shared chassis and board drawing on Canvas
      board-main.ts              # Board selector, tile editor, parameters, YAML
      board-renderer.ts           # Geometry-driven board drawing and selection
      simulation.worker.ts       # Batch execution with progress and cancellation
    cli/
      main.ts                    # Optional Node.js batch runner
  tests/
    geometry.test.ts
    chassis.test.ts
    board.test.ts
    sensing.test.ts
    dynamics.test.ts
    controller.test.ts
    simulation.test.ts
  outputs/                       # Generated plots, conditions, summaries; ignore in Git
```

## Shared conventions and interfaces

- Geometry, positions, line widths, and wheel dimensions use millimetres; time
  uses seconds, linear speed mm/s, and wheel angular speed rad/s when needed.
- Chassis origin is the midpoint between the driven wheel centers on the drive
  axle. Local +x points forward, +y points left, and +z points up.
- World +X points right on the board drawing and +Y points up. Heading zero puts
  chassis +x along world +X. Positive heading and yaw rate are counterclockwise.
  Display angles may use degrees; calculations use radians.
- A standalone chassis plot puts the front upward and labels its local axes.
  Both plots use equal physical scale on both axes.
- Local point `(x, y)` at world pose `(X, Y, theta)` transforms to
  `(X + x*cos(theta) - y*sin(theta), Y + x*sin(theta) + y*cos(theta))`.
- Drive track width is the lateral center-to-center spacing of the driven wheels.
  Wheelbase is the longitudinal distance between drive and front axles. These are
  different measurements; tire outside-to-outside width is a third measurement.
- Chassis body and collision outlines are separate ordered simple polygons.
  The red polygons in `references/T90L91.png` and `references/T100L101.png` are the
  authoritative collision boundaries. Ignore the protruding camera for collision
  for now, and do not automatically expand these polygons to include visual parts.
  Concavity is preserved;
  never replace the supplied outline with its convex hull. Polygon holes are out
  of initial scope. Reject self-intersections and zero-area outlines.
- Use eight uniquely named sensors with explicit local coordinates. Do not infer
  controller left/right order from YAML list order; make that order explicit.
- Board geometry is the shared source for drawing and sensing. Represent black
  markings as a finite-width stroke around straight and circular-arc paths.
- Keep state, observations, and commands separate: pose is `(X, Y, theta)`,
  observations contain eight readings, and commands contain left/right wheel
  speeds. Controller state also stores its integral, previous error, and speed ramp.
- Configuration files carry a schema version. Validate units, required fields,
  positive dimensions, sensor count, polygon validity, and tile connectivity.

## Stage 1 — Chassis visualizer

Read two independently editable YAML files and draw each chassis at physical scale.
Show body outline, drive and passive wheels, axle centers, origin, axes, sensor IDs,
and key dimensions. Show the supplied collision polygon in red independently of
visual components. Provide individual views and a same-scale comparison.

Current increment: both YAML files are implemented with a chassis selector on the
permanent `chassis.html` page. The root URL redirects there. The browser visualizer
supports YAML import/edit/export, parameter tables, red polygon vertex labels,
physical dimensions, zoom, heading, and PNG export. The user confirmed T90L91's
11.15 mm sensor pitch and x=48 mm, centered placement, ID order, equal front wheel
widths, symmetrical polygons, and flush front wheel assemblies. T100L101 uses the
same sensor array at x=56 mm from its drawing. Front tracks are 82.60/92.60 mm.
The four resolved review notes have been removed. Simultaneous same-scale comparison
is not implemented yet. Board visualization now has its own `board.html` page;
the chassis studio and its functionality are preserved.

Render wheels as top-view rectangles using tire diameter along local x and tire
width along local y. Drive wheel centers are `(0, +/- drive_track/2)`; front wheel
centers are `(front_axle_x, +/- front_track/2)`. Explicit sensor coordinates support
uneven spacing and staggered layouts. Treat wheels as visual geometry initially;
retain their shapes for the collision stage.

The visualizer should accept a pose transform so the same chassis drawing can be
reused on the board later. The actual measurements needed are in
[CHASSIS_INPUTS.md](CHASSIS_INPUTS.md).

Done when both measured chassis load, their labels and dimensions match the supplied
data, and changes to sensor or wheel placement are visible without editing code.

## Stage 2 — Board visualizer

Use an array of square tiles with a default size of 240 mm. Implemented tile tokens:

| Token | Connected edges |
| --- | --- |
| `empty` | None |
| `straight_ew` | East–west |
| `straight_ns` | North–south |
| `turn_ne` | North–east |
| `turn_nw` | North–west |
| `turn_se` | South–east |
| `turn_sw` | South–west |

Tokens specify connections, not travel direction. Lines meet tile edges at their
midpoints. The array's first row is the top of the drawing; world origin is the
board's bottom-left corner. For `N` rows, row `r`, column `c` has center
`((c + 0.5)*240, (N - r - 0.5)*240)` under the default tile size.

Specify line width and turn centerline radius independently, with board defaults
and optional per-tile overrides. A 120 mm radius makes a quarter-circle connecting
adjacent edge midpoints in a 240 mm tile. Smaller positive radii use tangent straight
approaches joined by a quarter-circle. The initial tile scheme supports radii up
to half the tile size; larger turns require a later multi-tile path definition.
Line width remains independent of radius. Support radius 10 mm with width 25 mm;
the inner stroke fills in when the half-width exceeds the radius.

The YAML names these `default_width_mm` and `default_turn_radius_mm`. Simulation
conditions override both. A run-level radius replaces per-tile design overrides as
well as the board default so a sweep applies one radius to every corner.

Draw grid boundaries, black markings, columns, and coordinates. Validate matching
connections between neighbors and report unintended open ends; explicitly allowed
route endpoints are valid. Defer three-way branch geometry and route choice.

Implemented from the three supplied drawings: Loop, Elle, and Snake, each with
four columns and three rows (960 × 720 mm). Columns occupy all 20 grid intersections
including the boundary. The 20 mm display diameter is visual only: physical column
data stores centers, and later collision/clearance checks must use those centers
without subtracting a radius. Initial corner radius 80 mm and line width 20 mm are
chosen adjustable defaults, not dimensions measured from the centerline drawings.

The separate `board.html` page offers a preset selector, clickable tile editor,
default radius/line-width sliders, per-corner radius overrides, grid/column display
controls, YAML import/edit/export, source drawing links, and PNG download. Keep the
chassis page available through shared navigation. Open/disconnected tile drafts can
be edited and saved, with connection diagnostics shown. All three presets are one
closed loop. See [board format](BOARD_FORMAT.md) for the full schema and UI behavior.

Done when straight tiles and all four turns render correctly, adjacent paths meet
with the intended tangents, and line-width/radius edits change the actual sensed
geometry as well as its picture.

## Stage 3 — Static sensing and column clearance

Place either chassis at a known world pose and transform all eight sensors. Begin
with ideal point sampling: a sensor is black when it lies within half the line
width of any finite path segment or arc. Handle segment endpoints and arc angular
limits explicitly. Overlapping strokes form a union, never additive darkness.

Use normalized readings with white = 0 and black = 1. Later support a configurable
optical footprint with readings proportional to black coverage. Add configurable,
zero-mean noise using a seeded, simulation-owned random generator, then clamp to
the normalized range. Noise defaults to off. Rendering and diagnostic calls must
not consume the observation random stream; sample once per simulation step.

For collision checking, transform the actual footprint and query each column:

1. Compute the minimum distance from the column center to every polygon edge.
2. Use point-in-polygon to determine whether the center lies inside the outline.
3. Make distance negative inside, zero on the boundary, and positive outside.
4. Use this signed center-to-polygon distance directly as clearance. Contact or
   containment of the center is `clearance <= 0`. Do not subtract a column radius;
   the configured diameter is exclusively a visualization parameter.

This supports concave outlines without a convex hull. For the two supplied chassis,
use only their explicit red collision polygons and ignore the camera. Do not union
in wheel or body drawings automatically. An optional later mode can construct a
footprint from components when no explicit collision outline is supplied.
For such a union of body and wheel polygons, use the minimum component clearance for
collision and positive separation; a negative result indicates overlap, not an
exact penetration depth of the union. Report the closest column ID and clearance
at each pose, plus minimum clearance over a run. No columns means no closest column.

Column clearance measures obstacle safety. Separately measure line-following error
at a declared chassis reference point, initially the mean sensor position, using
the intended route centerline. More clearance alone does not prove better tracking.

Done when hand-checkable sensor poses, black-line boundaries, concave notches,
column contact, and repeatable noisy observation sequences behave as specified.

Implemented static-sensing increment: `observe.html` selects either chassis and any
of the three boards, overrides line width and all corner radii, edits X/Y/heading,
and supports pointer/touch dragging. Eight ideal binary point readings update live.
Sensing uses analytical finite-segment and finite-arc distance against prepared
geometry shared with rendering; screen pixels never enter the calculation. Signed
clearance from the red collision polygon to all column centers is implemented and
the closest center is highlighted. Noise remains deferred by user choice.

## Stage 4 — Differential-drive motion

Initially command wheel rim speeds directly in mm/s. With drive track `b`, left
speed `v_left`, and right speed `v_right`:

```text
forward_speed = (v_right + v_left) / 2
yaw_rate      = (v_right - v_left) / b
```

Use exact constant-command straight/arc integration over each step, with a stable
straight-line limit near zero yaw rate. Wheel diameter converts rad/s or RPM into
rim speed; it does not change ideal motion when rim speeds are already specified.
Front axle spacing affects footprint and clearance but not this ideal motion law.

Board turn radius is an independent design input. The robot's realized turning
radius comes from wheel speeds: `forward_speed / yaw_rate` for nonzero yaw rate.
Add an optional vehicle curvature or minimum-radius constraint only if requested;
it should not be conflated with the radius of the printed black line.

At each 20 ms controller tick: observe current pose, update the controller, hold its
commands over the interval, integrate motion, and update current state and running
summary metrics. Do not persist per-step history.
Keep optional motion/collision substeps below this interface. Endpoint-only collision
checks can miss a column between poses, so use swept checks or conservatively bounded
adaptive substeps before claiming a run was collision-free. The check must account
for rotating corners as well as translation, and have a documented tolerance.

Done when equal speeds move straight, opposite speeds rotate about the axle
midpoint, one stopped wheel produces the expected pivot, and constant-radius
trajectories match analytic examples with consistent 50 Hz timing.

## Stage 5 — PID line following and trial runner

Derive line offset from the known lateral sensor coordinates and their blackness
weights. Define an explicit no-line case instead of dividing by zero. Make loss
handling configurable, initially stopping and recording failure. Reacquisition,
branch selection, and reverse driving are later behavior choices.

Convert PID output into requested yaw rate or differential wheel speed, then map
to left/right commands. Define the error sign so a line left of the robot causes
a left turn. Include wheel speed limits and integral anti-windup. Keep all gains,
limits, sensor weighting, and any filtering in configuration.

The user command is a forward/stop boolean plus a configured target speed. The
controller owns its speed ramp, with separate acceleration and deceleration limits;
deceleration can be much faster. Physical braking limitations are outside the initial
ideal model. Start each baseline at rest with forward enabled throughout the run.

Run both chassis for 60 simulated seconds on an agreed board and initial pose.
Stop and record failure on collision; define the allowed line-loss duration and
completion criteria before comparing runs. Keep one conditions row per trial and
one summary result. Accumulate statistics during execution without storing a
per-step history of poses, sensor readings, or wheel commands.

Report minimum clearance, RMS/maximum tracking error, time with no line detected,
distance traveled, and route progress/laps where the route definition supports it.
A stopped robot with no collisions must not count as a successful run. Save resolved
configuration snapshots, seed, engine build identifier, and actual simulated duration
with every result. Selecting a result for visual inspection reruns its saved
conditions. See [simulation conditions and summaries](SIMULATION_RUNS.md) for the
table fields, sharing format, and determinism requirements.

Done when the nominal case completes, deliberately poor parameters produce useful
failure reports, and identical configuration and seed reproduce the same trajectory
within the same software environment.

## Progress checklist

- [x] Inspect repository and supplied chassis reference image.
- [x] Record staged scope, proposed layout, coordinate conventions, and interfaces.
- [x] Document the measurements needed to start stage 1.
- [x] Inspect both dimensioned chassis drawings; record red-polygon collision policy.
- [x] Compare browser and native options and document a TypeScript recommendation.
- [x] Specify conditions tables, summary-only storage, and deterministic visual reruns.
- [x] Implement the TypeScript/Vite/Canvas application shell.
- [ ] Confirm measurements and collision outline for both chassis.
- [x] Stage 1: implement validated YAML loading and shared chassis rendering.
- [x] Stage 1: create T90L91 with user-confirmed 11.15 mm sensor pitch and 48 mm offset.
- [x] Stage 1: verify geometry, YAML validation, production build, and browser interactions.
- [x] Stage 1: user review of T90L91 dimensions and remaining assumptions.
- [x] Stage 1: add T100L101, remove resolved notes, and preserve a dedicated chassis page.
- [ ] Later: add a simultaneous same-scale chassis comparison view if needed.
- [x] Obtain three board layouts and center-only column semantics; set editable radius/width defaults.
- [x] Stage 2: implement straight/turn tiles, connectivity checks, and board rendering.
- [x] Stage 2: add three YAML presets, graphical tile editing, and per-corner radius overrides.
- [x] Stage 2: validate radius extremes, geometry continuity, YAML round trips, and browser navigation.
- [x] Stage 3: implement static pose controls, dragging, and ideal point sampling.
- [ ] Stage 3: add deterministic sensor noise and its configuration.
- [x] Stage 3: implement concave-footprint collision and center-clearance reporting.
- [ ] Stage 4: implement motion integration, fixed timing, and collision checks in motion.
- [ ] Agree target speed, limits, initial poses, and success/failure criteria.
- [ ] Stage 5: implement PID, forward/stop input, and acceleration/deceleration ramps.
- [ ] Stage 5: run and compare reproducible 60-second trials for both chassis.
- [ ] Stage 5: export/import conditions and summary bundles; verify deterministic replay.
- [ ] Later: sweep board radii, line widths, chassis placements, speed, and PID gains.
- [ ] Later: add three-way tiles, routing policy, and measured hardware effects.

Verification should focus on meaningful geometric boundary cases, analytic motion
cases, deterministic runs, and closed-loop outcomes. Use visual review for drawing
correctness; do not treat appearance alone as evidence of correct simulation.
