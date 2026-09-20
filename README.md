# Line-following robot simulator

A planned 2D simulator for comparing two differential-drive chassis, designing a
line-following board, and tuning controller parameters before hardware trials.

The work starts with a chassis visualizer, then adds a board visualizer, optical
sensing, vehicle motion, and a PID controller running at 50 Hz simulated time.

- [Development plan and progress checklist](docs/DEVELOPMENT_PLAN.md)
- [Measurements needed for the chassis visualizer](docs/CHASSIS_INPUTS.md)
- [Technology options and browser recommendation](docs/TECHNOLOGY.md)
- [Simulation conditions, summary results, and reruns](docs/SIMULATION_RUNS.md)
- [Existing chassis reference drawing](references/Robot%20chassis.jpeg)

Current status: planning only. No simulator or executable configuration has been
implemented. Both dimensioned chassis drawings have been inspected; transcribed
geometry and remaining sensor/front-wheel details are recorded in the input guide.
