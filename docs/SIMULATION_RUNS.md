# Simulation conditions, summaries, and replay

## Storage rule

Persist complete conditions and one aggregate summary per trial. Do not persist a
pose, sensor reading, or wheel command for every timestep. Visual inspection reruns
the saved condition through the deterministic simulation core.

## Conditions

A reproducible condition contains:

- Simulation engine version.
- Complete chassis and resolved board configurations.
- Initial world pose.
- Requested duration and fixed control timestep.
- Line width and turn radius overrides.
- PID gains, speed target, acceleration/deceleration, and limits.
- Motor-output transport delay.
- Collision substep settings and line-loss grace interval.

A filename is not an immutable configuration: changing a YAML file must change the
condition identity. Sweep-cache keys therefore hash the complete configurations and
settings rather than their display names.

Noise trials include severity and seed in the condition identity. The noise function
is stateless and deterministic: it derives smooth bounded values from seed, channel,
and simulated time, so execution order and worker count cannot change a trial.

## Summary

`SimulationSummary` contains:

- Status: completed, line loss, or cancelled.
- Success flag, requested/actual duration, and completed step count.
- Distance travelled.
- Minimum column clearance, column ID, and time.
- RMS and maximum absolute line error plus valid-error duration.
- Total and longest continuous line-loss duration.
- First nonpositive-clearance column/time and final pose.

Column overlap does not terminate a trial. Minimum clearance continues decreasing
below zero as the column centre moves farther inside the chassis polygon, preserving
a continuous optimization metric over the requested duration.

Undefined quantities use `null`; portable JSON never contains infinity. Metrics are
updated incrementally, so memory use does not grow with trial duration.

## Determinism

Fast run, real-time replay, and sweep workers execute observations, control, motion,
collision checks, and metric updates in the same order at the same 20 ms timestep.
Rendering does not alter state. Reordering sweep rows does not alter a trial.

Exact reproduction requires the same resolved inputs and simulation engine version.
Floating-point behavior is tested within the supported JavaScript environment; the
project does not promise bit-identical results across arbitrary runtimes.

## Files and sharing

The Run studio downloads one conditions-and-summary JSON document. The Sweep studio
downloads its sweep definition, configuration snapshots, and all summary rows.

During local development, sweep and robustness rows are also merged into the content-addressed
`data/sweep-cache.json.gz`. Static deployments cannot write it and use memory plus
explicit downloads. Sharing cached results through the repository requires a normal
Git commit.

