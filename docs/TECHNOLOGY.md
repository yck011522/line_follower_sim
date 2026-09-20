# Technology options

Status: TypeScript, Vite, and Canvas 2D are implemented for both chassis in the
dedicated `chassis.html` visualizer. Preserve this page when adding a separate board
page later. Browser batch workers and the optional Node.js batch runner remain planned.

## Recommendation

Use TypeScript compiled to JavaScript, with a browser UI, Canvas 2D rendering, and
a simulation core that also runs without rendering. Host the built static site on
GitHub Pages. Users open a URL and need no local language runtime or package setup.
Developers will need build tools; a repository build workflow can produce the site.

TypeScript provides compile-time checks while producing JavaScript for deployment;
the core can target browser and Node.js environments with appropriate build settings.
See the [TypeScript module documentation](https://www.typescriptlang.org/docs/handbook/modules/theory.html).
GitHub Pages serves static HTML, CSS, and JavaScript, so computation runs on the
visitor's machine, with no Python or Java application server on Pages. See
[GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Comparison for this project

| Option | Fit | Tradeoff |
| --- | --- | --- |
| TypeScript/JavaScript | Recommended for shared interactive simulation and one reusable engine | Requires a frontend build for TypeScript; browser execution has lifecycle limits |
| Python | Useful for scientific analysis and large offline experiment pipelines | Native execution requires a runtime/environment somewhere; headless does not mean no-install |
| Python in the browser | Possible when Python libraries are central to the design | Adds a browser Python runtime and JS integration that this initial geometry model does not require |
| Java | A possible desktop or server simulation engine | Would add deployment/UI work without a clear benefit for the requested static browser application |

Python can run in the browser using WebAssembly through
[Pyodide](https://pyodide.org/en/stable/). This is a viable alternative, but my
engineering judgment is that a second runtime adds unnecessary complexity for this
small geometry-and-control engine. Python can still analyze exported CSV results
later without maintaining a duplicate simulator.

## Execution and drawing

Keep `step(state, wheelSpeeds, dt)` and sensor/collision geometry independent of
rendering. The same core supports:

1. Interactive viewing: simulate at a fixed 0.02-second control period and render
   the latest state at the display rate, with pause, step, and speed controls.
2. Browser batch runs: execute as quickly as possible in a Web Worker, draw nothing
   during computation, and send occasional progress and final summary statistics.
   Replay reruns the saved conditions instead of loading a stored trajectory.
3. Optional command-line runs: execute the same core under Node.js for unattended
   parameter sweeps, with its runtime installed on that machine or a CI runner.

[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) run
scripts on a separate background thread, allowing the interface to remain responsive.
Use explicit seeded randomness, fixed simulation time, and chunked work so cancellation
is processed. Closing the page ends a browser run; do not promise uninterrupted
unattended computation in background or suspended tabs.

A 60-second trial contains only 3,000 controller updates, plus any collision/motion
substeps. With eight sensors and modest board geometry, I expect this to be a
reasonable JavaScript workload, but actual throughput must be benchmarked. Do not
promise a speedup before measuring representative cases.

Start with built-in [Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API).
Simple polygons, circles, lines, and arcs do not initially justify a graphics engine.
A faster renderer only helps drawing; batch simulation throughput depends on the
geometry and control computations. Cache static board drawing and profile before
considering WebGL, a drawing library, or WebAssembly optimization.

Compute sensing and collisions analytically from geometry, never by reading display
pixels: zoom, antialiasing, and screen resolution must not alter simulation results.
Use a single explicit world-to-screen transform to handle Canvas's downward screen
y-axis while preserving the physical coordinate conventions.

## Configuration and sharing

- Bundle the two default YAML chassis files and sample boards with the app.
- Allow local YAML import and editing without uploading files to a server.
- Export a conditions table and summary statistics, with immutable configuration
  snapshots and engine version in a portable JSON bundle; offer CSV for analysis.
  Do not persist a per-step trajectory. See [simulation runs](SIMULATION_RUNS.md).
- Allow recipients to import those files to reproduce a run; a compact configuration
  URL can be a later convenience.
- GitHub Pages hosts the application and committed examples. It does not by itself
  provide a shared writable results database or save visitors' changes to GitHub.
- Build asset URLs for the repository's Pages subpath. Test the production build at
  that path before publication; deployment is a later task, not part of planning.

## Local workflow for someone coming from Python

JavaScript needs a runtime, just as Python needs a Python interpreter. A browser
already has a JavaScript engine. Node.js supplies a runtime for running JavaScript
outside the browser, including development tools and command-line simulations.
For local development, install Node.js and npm once. npm manages project libraries;
it serves a similar purpose to pip. See the official
[Node.js introduction](https://nodejs.org/learn) and
[Node.js/npm installation guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/).

| Python concept | Proposed JavaScript/TypeScript equivalent |
| --- | --- |
| Python runtime | Node.js for terminal tools; the browser's existing engine for the UI |
| `pip install library` | `npm install library` |
| Dependency manifest | `package.json`, plus `package-lock.json` for resolved versions |
| Project-installed libraries | `node_modules/`, normally managed without activating a virtual environment |
| `python script.py` | `node script.js` for JavaScript; project commands handle TypeScript conversion |
| An editor Run button | A configured editor task/debug launcher, or `npm run ...` in the terminal |

Implemented development commands:

```sh
npm ci
npm run dev
```

The first command installs project dependencies. The second starts a local development
server using Vite. Open the localhost URL it prints in a browser. The
server serves the application and transforms TypeScript into JavaScript; the browser
executes the UI and interactive simulation. Saving source edits updates the page.
This server is a local development tool, not a remote simulation service. See
[Vite's getting-started guide](https://vite.dev/guide/).

For future browser batch runs, use the same local page and choose Run batch; a worker
executes the core without animation. For terminal batch runs, a proposed command is
`npm run batch -- experiments.csv`, which will invoke a Node.js runner without
opening a browser. `batch` is our future project script, not an npm built-in.

`npm run build` type-checks and builds the distributable website. `npm run preview`
serves that build locally to verify it before hosting. Both scripts are implemented.
See [Vite deployment guidance](https://vite.dev/guide/static-deploy).

On Windows, `start-visualizer.cmd` launches the development server and opens the
browser. It uses installed Node.js or the portable runtime provisioned in this
workspace's ignored `.tools/` directory. The portable runtime is not committed;
fresh checkouts should install Node.js 24 LTS and npm.

Visitors to the hosted site need only a browser. They install neither Node.js nor
npm. Both interactive and batch browser runs happen on their own computers.
