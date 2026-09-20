# Simulation conditions, summaries, and deterministic reruns

User decision: store one row of conditions for each trial and only summary results.
Do not persist poses, wheel commands, or sensor readings for every time step.
To inspect a trial visually, rerun its saved conditions with drawing enabled.

## Conditions table

Each row defines a complete trial. Show readable chassis/board/controller names in
the interface while retaining immutable references to their resolved configuration.

| Field | Meaning |
| --- | --- |
| `run_id` | Unique trial identifier |
| `chassis_config_id` | Reference to an immutable snapshot of chassis geometry |
| `board_config_id` | Reference to an immutable snapshot of tiles, lines, and columns |
| `controller_config_id` | Reference to gains, speed limits, ramps, and loss handling |
| `initial_x_mm`, `initial_y_mm`, `initial_heading_deg` | Initial world pose |
| `initial_state_id` | Snapshot of any additional initial state; defaults include stopped wheels, zero PID integral, and reset filters |
| `requested_duration_s` | Requested simulated duration, initially 60 seconds |
| `control_dt_s` | Controller interval, initially 0.02 seconds |
| `command_schedule_id` | Snapshot of user input over simulated time; initially forward enabled throughout |
| `noise_config_id`, `seed` | Noise distribution/amplitude and deterministic random seed |
| `numerics_config_id` | Integration, collision-check settings/tolerances, and metric sampling rules |
| `engine_version` | Immutable simulator build identifier covering PRNG and metric implementations |
| `schema_version` | Version of the saved-data format |

The visible table can offer scalar override columns for common sweeps, such as
target speed, line width, turn radius, and PID gains. Resolve these overrides into
the saved snapshots before running, so the replay inputs are unambiguous.

Store configuration snapshots once per distinct configuration and reference them
from many rows. A filename alone is insufficient: changing `chassis_a.yaml` later
must not change an old trial's meaning. Save the exact built-engine identity and
retain the corresponding build/source and dependency lockfile so later replay can
use the matching implementation. A new engine version creates a new trial result.

## Summary results

Join one summary record to each conditions row by `run_id`. Planned fields:

- Status: completed, collision, line loss, cancelled, or error, plus success/failure
  according to the trial's saved criteria.
- Actual simulated duration and completed control-step count.
- Minimum column clearance, the corresponding column ID, and simulated time.
- RMS and maximum absolute tracking error, and duration of valid error samples.
- Total duration and longest continuous interval with no line detected.
- Distance traveled and route progress/lap count when defined.
- First collision time/column or other stopping reason when applicable.

Use null for undefined quantities, such as clearance on a board without columns;
do not encode infinity in portable JSON. Keep computational errors and cancelled
runs distinct from completed trials.

Update these statistics incrementally: minimum clearance needs only the previous
minimum, while RMS needs a running squared-error sum and its time/sample weight.
Store current simulation/controller/random-generator state in memory, not its full
history. Keep control-tick metric sampling consistent across execution modes, and
include collision substeps when finding minimum clearance and contact. Rendering
must not alter the statistics or consume sensor noise samples.

## Determinism and visual inspection

Conditions plus seed alone are not sufficient if code, defaults, or configuration
files change. Reproducible replay also requires:

1. The exact resolved configuration and initial state, including controller state.
2. The same engine/PRNG implementation and fixed simulation timestep.
3. Stable sensor iteration and random-sample ordering, independent of rendering,
   wall-clock time, progress reporting, or batch scheduling.
4. Commands driven by simulated time. Future interactive manual commands must be
   saved as a command schedule to become replayable conditions.

Use a specified seeded PRNG, not `Math.random()`. Initialize an independent generator
per trial so adding/reordering other table rows cannot change a trial's result.

Target exact repeatability within the same engine build and execution environment.
Do not promise bit-for-bit equality between all browsers and Node.js without
verification: floating-point math functions can differ across engines. Check browser
and terminal agreement with documented numerical tolerances and representative
boundary cases. If cross-platform bit-exact replay becomes mandatory, specify and
test deterministic math as an additional requirement rather than assuming a seed
alone provides it. Save runtime identity with the summary for diagnosing differences.

Selecting Replay starts the original trial again and draws the recomputed state.
Replaying does not overwrite the stored summary; compare the recomputed result
against it. Seeking to a time initially reruns from the initial state up to that
time. Temporary in-memory visualization data is allowed, but no per-step history
is persisted in the experiment dataset.

## Files and sharing

Use a portable JSON bundle containing the conditions rows, configuration snapshots,
and summary records. Offer flat conditions/results CSV exports for spreadsheet or
Python analysis; reference columns must be accompanied by the configuration bundle
to support replay. No central database is needed initially.

The browser offers download/import of this bundle. A later Node.js runner reads
the same conditions and writes the same summary format directly to disk. Export
remains necessary for sharing; merely viewing a table does not publish it or save
it to the GitHub repository.

Acceptance checks: repeat a trial and compare summaries; compare interactive and
batch modes; reorder batch rows; replay a saved bundle after editable YAML files
change; verify the exported dataset contains no per-step histories.
