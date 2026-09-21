# Line-following robot simulator

A 2D simulator project for comparing two differential-drive chassis, designing a
line-following board, and tuning controller parameters before hardware trials.

The work starts with a chassis visualizer, then adds a board visualizer, optical
sensing, vehicle motion, and a PID controller running at 50 Hz simulated time.

## Run the chassis visualizer

On Windows, double-click [start-visualizer.cmd](start-visualizer.cmd). It starts the
local development server and opens the browser. Keep its terminal open while using
the app; press Ctrl+C in that terminal to stop it. This workspace has a portable
Node.js runtime in the ignored `.tools/` directory, which the launcher can use.

For a fresh checkout, install Node.js 24 LTS (including npm), then run:

```sh
npm ci
npm run dev
```

Open the localhost URL printed in the terminal. In Windows PowerShell, use
`npm.cmd` instead of `npm` if execution policy blocks the npm PowerShell wrapper.

Use the chassis selector to switch between [T90L91.yaml](configs/chassis/T90L91.yaml)
and [T100L101.yaml](configs/chassis/T100L101.yaml). All distances are in **mm**.
Both use a centered eight-sensor row at **11.15 mm** pitch, with s0 on the left (+y).
T90L91's sensor forward offset is **48 mm**; T100L101 uses **56 mm** from its drawing.
Front tracks are **82.60 mm** and **92.60 mm**, respectively, placing equal-width
omni-wheel assemblies flush with the symmetrical collision outlines. The user
accepted this model and reviewed the sensor numbering/orientation; the four resolved
review notes have been removed.

The studio has its own permanent page at **`/chassis.html`**. The root URL currently
opens that page; the board studio is separate at `/board.html`. To link to the
second chassis directly, use **`/chassis.html?model=T100L101`**. On GitHub Pages, these
paths are relative to the repository site root.

- Inspect wheel dimensions, all eight optical centers, and polygon vertices.
- Edit YAML in the page and select **Apply changes**, or import a local YAML file.
- Switching chassis retains each file's applied state and unapplied draft in memory
  until the page is reloaded. Restore resets the selected chassis to its bundled YAML.
- **Download YAML** validates/applies pending edits and downloads the configuration.
  It does not overwrite the source file; copy reviewed edits back into that file.
- Toggle labels/grid/dimensions, change heading or zoom, and save a PNG.
- The red collision outline is authoritative. Camera and visual wheel envelopes do
  not automatically expand it. Front wheels are simplified assembly envelopes.

Heading is measured counterclockwise from world +X; 90° shows the front upward.
Sensor dots mark centers only and do not specify optical sensing footprints.

## Run the board visualizer

Use the same launcher and click **Game boards** in the header, or open
**`/board.html`** on the local server. Choose **Loop**, **Elle**, or **Snake** to view
the three supplied designs. The chassis page is preserved separately.

Each board uses a 240 mm grid, initially with an 80 mm corner radius and 20 mm black
line width. Use the sliders, click tiles to change their connections, or set an
individual corner radius. The initial sweep ranges are 10–120 mm radius and
10–25 mm line width. Grid spacing remains editable under the advanced settings.

The 20 mm column diameter is **visual only**; physical column data consists of its
center point. See [board editing and YAML format](docs/BOARD_FORMAT.md) for the tile
array, per-corner overrides, download/import workflow, and geometry conventions.

## Run the sensor visualizer

Click **Sensors** in the header or open **`/observe.html`**. Choose a chassis and
board, set the run-level line width and turn radius, then enter X/Y/heading or drag
the chassis directly. All eight ideal point readings update immediately. Yellow
means black (`1`); white means white (`0`).

The board files use `default_width_mm`. Both it and
`default_turn_radius_mm` are design defaults; values on the sensor page replace them
for the current observation. The radius override applies to every corner.

Sensing uses vector distance to the same finite line segments and circular arcs that
draw the board. It does not inspect JPEG or Canvas pixels, so zoom and antialiasing
cannot change results. Geometry is prepared once per parameter change and reused
for the eight sensor queries. Later high-volume runs can add a spatial index or
precomputed distance field behind this interface if profiling shows it is needed.
See [sensor observation architecture](docs/SENSING_ARCHITECTURE.md) for the distance
rules, caching boundary, and later optimization options.

The page also highlights the closest column center and reports signed clearance from
the red chassis collision polygon. Positive is clear, zero is boundary contact, and
negative means the center is inside the polygon. It lists the five nearest centers
for spot checks while dragging. Column display diameter does not affect these values.

## Run the closed-loop simulation

Click **Run** or open **`/simulate.html`**. The controller uses the lateral centroid
of the active sensors as line error, maps it to a yaw-rate request with PID, and then
maps forward speed plus yaw to left and right wheel speeds. The page exposes line
width, turn radius, initial pose, duration, speed ramps, PID gains, yaw limit, and
wheel-speed limit.

**Fast run** advances the fixed 50 Hz model as quickly as the browser permits.
**Real-time replay** reruns the last trial at wall-clock speed using exactly the same
simulation steps. Both modes use analytical sensing, exact differential-drive motion,
and bounded collision substeps. Only aggregate statistics are retained: result,
duration, distance, minimum clearance, line error, and line-loss durations. Download
the resolved configurations and summary as JSON; it contains no per-timestep history.

The initial page runs one condition at a time. The condition-row schema, Cartesian
sweep expansion, browser-worker/Node-runner boundary, and replicate statistics are
documented in [controller and parameter sweeps](docs/CONTROL_AND_SWEEPS.md).

## Run parameter sweeps

Click **Sweeps** or open **`/sweep.html`**. Its initial experiment runs the Elle
board for 200 simulated seconds at every combination of:

- Turn radius: 10–120 mm in 10 mm steps.
- Line width: 14–26 mm in 2 mm steps.
- Kp: 0.1–0.8 in 0.1 steps.

That produces 672 independent trials across up to four Web Workers, leaving the page responsive.
Choose any two parameters as heat-map axes and select a slice of the third. The map
can display minimum column clearance, RMS line error, or maximum line error. Green
means better: larger for clearance and smaller for errors. Failed runs are dark red.
Click a cell for its full summary or to open those conditions in the Run studio.

The robustness suggestion maximizes the worst minimum clearance in each interior
3 × 3 × 3 neighborhood. This favors a broad safe region and excludes boundary
settings whose behavior beyond the tested range is unknown. Downloaded JSON contains
the sweep definition, configuration snapshots, and one aggregate summary per trial.

When the app is started locally with `start-visualizer.cmd` or `npm run dev`, sweep
summaries are also cached automatically in `data/sweep-cache.json`. Before running,
the page hashes every complete condition and reuses exact matches, including matches
from partially overlapping sweeps. New results are merged into the cache in small
batches. The cache is an ordinary repository file, so `git status` will show its
changes and you may commit it when the results should be shared.

The cache key covers the engine version, complete chassis and board snapshots,
initial pose, simulation/controller settings, line width, turn radius, and Kp.
Changing any of these creates a new entry. Static hosting such as GitHub Pages has
no write API; there the page displays **Static mode**, keeps results in memory, and
continues to support JSON download.

## Checks and production build

```sh
npm test
npm run build
npm run test:browser
```

The browser test uses installed Google Chrome in headless mode and writes desktop
and mobile screenshots into ignored `outputs/`. Set `BROWSER_CHANNEL=msedge` to use
installed Microsoft Edge instead. Build before running the browser test.

`npm run preview` serves the production build locally. Relative asset paths support
hosting the built `dist/` directory under a GitHub Pages repository path. Nothing
has been published. Sensor noise and the automated batch runner remain later stages.

## Project documents

- [Development plan and progress checklist](docs/DEVELOPMENT_PLAN.md)
- [Measurements needed for the chassis visualizer](docs/CHASSIS_INPUTS.md)
- [Technology options and browser recommendation](docs/TECHNOLOGY.md)
- [Simulation conditions, summary results, and reruns](docs/SIMULATION_RUNS.md)
- [Board editing and YAML format](docs/BOARD_FORMAT.md)
- [Sensor observation architecture](docs/SENSING_ARCHITECTURE.md)
- [Controller and parameter-sweep architecture](docs/CONTROL_AND_SWEEPS.md)
- [Existing chassis reference drawing](references/Robot%20chassis.jpeg)

Current status: chassis, board, static sensing, closed-loop run/replay, and batch
sweep studios are implemented. A simultaneous chassis comparison view remains optional.
