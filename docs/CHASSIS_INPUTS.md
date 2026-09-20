# Inputs for the first chassis visualizer

Provide the following for each of the two chassis, in millimetres. An annotated
top-view drawing or coordinate table is sufficient; you do not need to prepare YAML
yourself. Unknown values can be identified explicitly and approximated for an early
drawing, with those approximations recorded in the configuration notes.

## Coordinate convention

The origin is the midpoint of the driven wheel centers. Looking down from above:

- +x points toward the front of the robot.
- +y points toward the robot's left side.
- +z points toward the viewer.

The standalone drawing will show the front upward. Its horizontal visual direction
is therefore opposite local +y: the left side of the picture is positive local y.

The supplied [reference image](../references/Robot%20chassis.jpeg) uses a vertical
forward axis and a horizontal lateral axis. Its labels appear to identify the two
chassis as `T90L91` and `T100L101`, now also identified by the new drawing filenames.
Use the coordinate convention above when translating the drawings. Its diagonal
annotations are not enough to establish wheel, outline, or sensor dimensions, and
the existing completion counts are not simulator results for this project.

## Received dimensioned drawings

Both [T90L91](../references/T90L91.png) and
[T100L101](../references/T100L101.png) have been inspected. Per the user's instruction,
their red outlines define collision geometry. Ignore the camera protruding beyond
the outline for collision now; it can be included in a later configuration revision.
Do not automatically add rendered wheels or other components to these polygons.

The following values are transcribed from drawing annotations in millimetres:

| Measurement | T90L91 | T100L101 |
| --- | ---: | ---: |
| Collision outline width | 118.00 | 128.00 |
| Front edge x from drive axle | 127.23 | 137.23 |
| Rearmost extent behind drive axle | 39.50 | 39.50 |
| Total collision outline length | 166.73 | 176.73 |
| Rear side/chamfer junction behind drive axle | 33.77 | 33.77 |
| Rear flat edge half-width (symmetry assumed) | 36.86 | 36.86 |
| Drive wheel center spacing | 90.36 | 100.36 |
| Drive wheel diameter | 65.00 | 65.00 |
| Drive tire width | 26.04 | 26.04 |
| Front axle forward offset | 91.00 | 101.00 |
| Front wheel diameter | 70.00 | 70.00 |
| Front wheel assembly width annotation | 35.40 | 35.40 |
| Forward offset near sensor row, interpretation to confirm | 48.00 | 56.00 |

With left/right symmetry assumed, the red polygons can be reconstructed as the
following ordered local `(x, y)` vertices. The symmetry and coordinate transcription
should be checked in the first visualizer against these source drawings.

```text
T90L91:
  (127.23, 59), (127.23, -59), (-33.77, -59),
  (-39.50, -36.86), (-39.50, 36.86), (-33.77, 59)

T100L101:
  (137.23, 64), (137.23, -64), (-33.77, -64),
  (-39.50, -36.86), (-39.50, 36.86), (-33.77, 64)
```

Remaining detail for accurate sensor/wheel rendering: sensor pitch or eight optical
center coordinates and ID order; confirmation that the 48/56 mm offsets refer to
optical centers; and front wheel center spacing/interpretation of the 35.40 mm
assembly width. The paired omni-wheel construction should be represented visually
without treating its internal rollers as extra chassis axles. The drawings provide
enough to start an outline/drive-wheel visual draft before these details are resolved.

## Required measurements

| Input | What to provide |
| --- | --- |
| Chassis name | A distinct name for each configuration. |
| Body outline | Ordered `(x, y)` vertices around the top-view perimeter, preserving concave cutouts. Either winding direction is acceptable; do not repeat the first point. |
| Drive track | Center-to-center distance between the left and right driven wheels. |
| Drive tires | Diameter and width; say whether the two wheels are identical. |
| Front axle position | Forward x-distance from the drive axle to the passive wheel axle. |
| Front track | Center-to-center distance between the passive wheels. |
| Front tires | Diameter and width; confirm that there are two passive omni wheels and whether they are identical. |
| Eight sensors | Each sensor's ID and `(x, y)` location at its optical sensing center. |
| Collision extent | Supplied: use the red polygons exactly, excluding the protruding camera. |

“Drive track width” and “distance between the two wheel center points” normally
describe the same quantity. If you meant different dimensions, label the endpoints
on the drawing. The distance between the drive axle and front axle is the wheelbase.

If the outline is unavailable, provide overall front/rear extents, width, and the
dimensions of every chamfer or notch. A rectangular approximation is enough to
start a visual draft, but clearance results will depend on the completed outline.

If the sensors are in a centered, evenly spaced row, provide the row's x-offset and
center-to-center sensor pitch instead of eight separate coordinates. For pitch `p`,
left-to-right local y-coordinates are:

```text
+3.5p, +2.5p, +1.5p, +0.5p, -0.5p, -1.5p, -2.5p, -3.5p
```

Also provide any sideways offset of that row and the physical left-to-right sensor
ID order. Staggered or uneven layouts require individual coordinates.

## Proposed YAML shape

This is a documentation template, not a loadable measured configuration. `null`
means a measurement is still needed, and the outline must contain at least three
valid vertices. Sensor IDs below are provisional, ordered from left to right.
The initial schema assumes identical wheel pairs with axes parallel to the drive
axle; flag exceptions so the schema can represent the actual chassis.

```yaml
schema_version: 1
name: chassis_a
units: mm
notes: []

body:
  outline_xy_mm: []               # Visual body only; can differ from collision

drive_axle:
  track_width_mm: null            # Centers at x=0, y=+/- track_width/2
  wheel_diameter_mm: null
  tire_width_mm: null

front_axle:
  x_mm: null                      # Forward offset from drive axle
  track_width_mm: null
  wheel_diameter_mm: null
  tire_width_mm: null
  wheel_type: passive_omni

sensors:
  left_to_right_ids: [s0, s1, s2, s3, s4, s5, s6, s7]
  positions:
    - {id: s0, x_mm: null, y_mm: null}
    - {id: s1, x_mm: null, y_mm: null}
    - {id: s2, x_mm: null, y_mm: null}
    - {id: s3, x_mm: null, y_mm: null}
    - {id: s4, x_mm: null, y_mm: null}
    - {id: s5, x_mm: null, y_mm: null}
    - {id: s6, x_mm: null, y_mm: null}
    - {id: s7, x_mm: null, y_mm: null}

collision:
  mode: explicit_polygon
  outline_xy_mm: []               # Red polygon; ordered [x, y], retain concavity
  include_wheels: false           # No automatic expansion of the explicit polygon
```

The same structure will be used for `chassis_b.yaml`. Configuration coordinates
describe physical geometry; drawing sizes for sensor markers should not silently
become optical footprint sizes or collision geometry.

## Useful later, but not needed to start

- Optical footprint size, sensor mounting height, and measured black/white outputs.
- Sensor output type (analog or thresholded), noise amplitude, and channel biases.
- Board tile layout, black-line width, turn radii, and column centers/radii.
- Maximum wheel speed, desired forward speed, acceleration, and deceleration.
- Motor command units and any measured command-to-wheel-speed relationship.

Stage 1 can proceed as soon as the two outlines, wheel geometry, and sensor
placements are known. No PID gains or board design are required for that stage.
