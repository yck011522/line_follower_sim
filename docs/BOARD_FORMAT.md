# Board studio and YAML format

Open **Game boards** in the page header, or visit `board.html` on the local server.
The chassis studio remains available at `chassis.html`. Both pages are built for
static hosting; no simulation server is required.

## Reference layouts

All three supplied drawings are implemented:

| Board | Configuration | Shape |
| --- | --- | --- |
| Loop | [board_4_3_loop.yaml](../configs/boards/board_4_3_loop.yaml) | Outer loop with four corners |
| Elle | [board_4_3_elle.yaml](../configs/boards/board_4_3_elle.yaml) | L-shaped loop with six corners |
| Snake | [board_4_3_snake.yaml](../configs/boards/board_4_3_snake.yaml) | Loop with an inward bend and eight corners |

Each is four columns by three rows of 240 mm tiles, giving a 960 × 720 mm board.
There are 20 column centers at the five-by-four grid intersections, including the
boundary. Cropped marks beyond the four-by-three grid in the Loop reference are
outside the modeled board. The reference lines specify centerlines; the renderer
adds physical line width in mm.

Initial values are **80 mm corner radius** and **20 mm line width**. These are
editable starting values, not dimensions claimed to have been measured from the
reference images. The column display diameter defaults to **20 mm**.

Both line settings are explicitly defaults: `line.default_width_mm` and
`line.default_turn_radius_mm`. A simulation run supplies resolved values that take
precedence over these design defaults. Its turn-radius override applies uniformly
to every corner, including any per-tile design override, so parameter sweeps compare
one radius consistently across the board.

## Editing

- Select a board using the board-file selector.
- Adjust default corner radius and line width with sliders or numeric inputs.
  The sliders cover 10–120 mm radius on the 240 mm grid and 10–25 mm line width.
- Click a tile in the drawing or the miniature tile layout. Choose its connections
  from the dropdown, then optionally set that corner's radius override.
- Clear the override field to restore inheritance from the board default. Changing
  the default radius leaves explicit per-corner overrides unchanged.
- Expand **Grid & column appearance** to change structural grid spacing or the
  display diameter. Radius must remain at most half the current grid spacing.
- Edit/import YAML for full layout changes, including row and column counts.
  Graphical edits update the YAML, preserving existing comments where possible.
- Apply pending text edits before changing graphical controls; invalid input leaves
  the last valid drawing in place. Missing tile connections are shown as layout
  diagnostics so a partially edited route can still be viewed and saved.
- Download YAML to keep edits, or save a PNG. Downloads do not overwrite files in
  the repository. Preset switching retains drafts in memory; reload or navigating
  to another page resets that memory, so download anything you want to keep.

The preset can be linked directly, for example `board.html?board=snake`. This selects
the bundled preset; it does not encode unsaved edits in the URL.

## YAML example

```yaml
schema_version: 1
name: Loop
units: mm
source: references/board_4_3_loop.png
grid_size_mm: 240
line:
  default_width_mm: 20
  default_turn_radius_mm: 80
columns:
  placement: grid_intersections
  display_diameter_mm: 20
  collision_reference: center
tiles:
  - [{type: turn_se, radius_mm: 60}, straight_ew, straight_ew, turn_sw]
  - [straight_ns, empty, empty, straight_ns]
  - [turn_ne, straight_ew, straight_ew, turn_nw]
```

Tile array rows run **top to bottom**, columns **left to right**. The UI labels these
starting at 1; array indices in code and validation errors start at 0. The board's
world origin is bottom left, with +X right and +Y up. For zero-based row `r`, column
`c`, `N` rows, and grid spacing `g`, the tile center is:

```text
X = (c + 0.5) * g
Y = (N - r - 0.5) * g
```

| Tile token | Connected edges |
| --- | --- |
| `empty` | None |
| `straight_ew` | East–west |
| `straight_ns` | North–south |
| `turn_ne` | North–east |
| `turn_nw` | North–west |
| `turn_se` | South–east |
| `turn_sw` | South–west |

Tokens describe connections, not driving direction. Three-way tiles are not yet
supported. A corner can be a simple token or `{type: turn_ne, radius_mm: 40}`.
Radius overrides on straight/empty tiles are rejected.

## Geometry and column semantics

Each corner is a quarter-circle, connected to fixed edge midpoints by tangent
straight approaches. At radius 120 mm in a 240 mm tile, those approaches disappear.
Smaller radii shorten the arc and lengthen the approaches without breaking joins.
The supported geometric range is `0 < radius <= grid_size_mm / 2`; the initial
parameter study range starts at 10 mm. Width is independent of radius: even
10 mm radius with 25 mm line width is supported, producing a filled inner bend.
Strokes have round caps and form a union at shared endpoints.

The analytical geometry is stored as straight segments and circular arcs, not
screen pixels. Drawing, future optical sampling, and later parameter sweeps can
therefore use the same underlying geometry. Grid lines and selection highlights
are editor overlays, not black markings or sensor inputs.

**Column diameter is visualization only.** Physical column data contains IDs and
center coordinates, not collision radii. Future clearance is the signed distance
from the actual chassis polygon to the nearest column center, with zero or negative
distance indicating contact/containment of that center. Do not subtract half the
display diameter or use it to expand the collision polygon. Changing the diameter
must leave all center-based clearance/collision results unchanged.

The layout checker identifies unmatched connections and separate connected loops.
Each supplied preset is one closed loop. The editor accepts intermediate open or
disconnected drafts; later simulation should validate a selected route before running.
The displayed centerline length is total line length, not a route-completion metric.

Checks cover all four turn orientations, 10 and 120 mm radii, tangent continuity,
tile joins, overrides, the thick-line/small-radius combination, grid scaling,
center-only column semantics, and YAML/UI round trips.
