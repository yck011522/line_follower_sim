# Sensor observation architecture

The static sensor studio is available at `observe.html`. It selects a chassis and
board, resolves simulation-level line width and turn radius, and evaluates eight
ideal point sensors at a world pose. Position can be entered numerically or changed
by dragging; orientation is in degrees in the UI and radians in the geometry core.

## Geometry pipeline

```text
board YAML + simulation overrides
              │
              ▼
       resolved board geometry
              │
              ▼
 finite segments + finite circular arcs ──────► Canvas renderer
              │
              ▼
     prepared analytical line
              │
chassis pose ─┴─► 8 transformed sensor points ─► distance tests ─► 0 / 1 readings
```

The board YAML fields `default_width_mm` and `default_turn_radius_mm` are design
defaults. A simulation resolves them to run-level values. The run-level radius
replaces all per-tile design overrides so a parameter sweep uses one consistent
radius. Resolving does not mutate the source board.

Path construction creates finite straight segments and circular arcs. A sensor's
distance to a segment uses its clamped projection; distance to an arc uses radial
distance only when its polar angle lies on the finite sweep, otherwise it uses the
nearest arc endpoint. The black stroke is the union of all primitive strokes:

```text
black when minimum centerline distance <= line width / 2
```

The boundary is considered black. Overlapping strokes do not add intensity. The
current output is ideal binary `0` or `1`; noise and optical footprint integration
are separate later layers.

## Performance strategy

The UI parses bundled YAML once. It rebuilds path primitives only when chassis,
board, line width, or radius changes. Dragging and pose edits reuse prepared geometry,
transform eight local sensor points, then scan the small primitive array. Rendering
and sensing consume the same primitives but remain independent: Canvas pixels,
device scale, zoom, grid overlays, and antialiasing never affect readings.

For the current four-by-three boards, direct vector math is small and predictable.
It also handles arbitrary real-valued width/radius overrides without generating or
storing images. A raster/JPEG lookup would introduce resolution, interpolation,
compression, and boundary-consistency problems. JPEG is particularly unsuitable
because lossy compression creates nonbinary pixels near black/white edges.

Optimization should follow representative profiling. The core interface permits
these later changes without changing controllers or UI:

1. Group primitives by tile and test only the sensor's tile plus neighbors.
2. Add bounding boxes or a uniform spatial grid around prepared primitives.
3. Precompute a high-resolution signed-distance field for a fixed board parameter
   combination, using a lossless numeric buffer rather than JPEG.
4. Further partition primitives within the existing Web Worker sweep execution.
5. Move the same distance kernel to WebAssembly only if measured throughput warrants it.

Parameter sweeps that change radius require new geometry per parameter combination,
but every timestep and every chassis pose within that run reuse it. Width changes do
not change centerline primitives; a future cache may share one primitive set across
several widths and change only the half-width threshold.

Tests cover finite segment endpoints, finite arc sweeps/endpoints, exact stroke
boundaries, chassis pose transforms, run-level override precedence, deterministic
repeat calls, browser controls, and drag interaction.

## Column-center clearance

The red chassis collision polygon is transformed into world coordinates without a
convex hull. For every board column center, the engine finds the nearest point on
every finite polygon edge and uses the minimum boundary distance. A ray-crossing
point-in-polygon test supplies its sign:

- Positive: column center is outside the collision polygon.
- Zero: column center touches the polygon boundary.
- Negative: column center is inside the polygon and therefore colliding.

Results are sorted by signed clearance; the minimum is the safety-critical closest
column and is highlighted in the sensor studio. If multiple centers are contained,
the most negative clearance appears first. The display diameter is never used by
this calculation. The page also lists the five smallest clearances for visual checks.
