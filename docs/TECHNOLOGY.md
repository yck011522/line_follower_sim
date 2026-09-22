# Technology and deployment

## Implemented stack

The project uses TypeScript, Vite, browser Canvas 2D, and Web Workers. This provides
an interactive application that can be hosted as static files while keeping the
geometry and simulation core independent of rendering.

Node.js is required for local development tools and builds. Visitors to a static
deployment need only a modern browser.

## Why TypeScript and the browser

- One language and simulation core serve interactive pages, real-time replay, and
  background parameter sweeps.
- Type checking catches configuration and interface errors before deployment.
- Canvas 2D directly supports the required polygons, lines, arcs, and labels.
- Web Workers keep multi-run sweeps from blocking the interface.
- Vite produces relative static assets suitable for a GitHub Pages repository path.

Python remains useful for downstream analysis of exported JSON, but duplicating the
simulation in Python would create two numerical implementations to maintain. Java
and an in-browser Python runtime do not provide a benefit for the current model.

## Execution modes

| Mode | Scheduler | Rendering | Persistence |
| --- | --- | --- | --- |
| Fast single run | Main page, chunked fixed steps | Occasional progress/final state | Downloaded JSON only |
| Real-time replay | Animation frames driving fixed 20 ms steps | Every display frame | Recomputed from conditions |
| Parameter sweep | Up to four Web Workers | Heat-map progress only | Local cache plus JSON download |

All modes use the same analytical sensor, controller, motion, collision, and metric
code. Canvas pixels are never simulation inputs.

## Local development

```sh
npm ci
npm run dev
```

The Vite development server transforms TypeScript and exposes a local-only cache API.
Sweep results are merged into `data/sweep-cache.json`. The Windows
`start-visualizer.cmd` launcher performs the same setup and opens the browser.

## Static production build

```sh
npm run build
npm run preview
```

The `dist/` directory is the deployable site. A static server cannot update the
repository, so the sweep page falls back to in-memory results and explicit JSON
downloads. GitHub Pages has the same read-only behavior.

## Dependencies

- `yaml` parses and emits editable configurations.
- Vite and TypeScript build the application.
- `tsx` runs TypeScript core tests.
- Playwright drives the installed Chrome or Edge browser for integration tests.

No rendering framework, physics engine, database server, or backend service is
required.
