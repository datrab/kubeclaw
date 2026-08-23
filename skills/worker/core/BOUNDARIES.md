# Worker Core Boundary

The worker core runs one bounded attempt. It owns lifecycle, cancellation,
limits, and neutral worker results. It does not schedule pipeline work or make
quality decisions.
