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
opens that page; a future board visualizer will be a separate page. To link to the
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
has been published. Board rendering, motion, sensing, and batch simulation are later
stages; there is no batch command yet.

## Project documents

- [Development plan and progress checklist](docs/DEVELOPMENT_PLAN.md)
- [Measurements needed for the chassis visualizer](docs/CHASSIS_INPUTS.md)
- [Technology options and browser recommendation](docs/TECHNOLOGY.md)
- [Simulation conditions, summary results, and reruns](docs/SIMULATION_RUNS.md)
- [Existing chassis reference drawing](references/Robot%20chassis.jpeg)

Current status: both chassis configurations and the dedicated chassis studio are
implemented. A simultaneous comparison view remains optional future work.
