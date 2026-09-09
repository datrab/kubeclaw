# Isolated Source and compaction integration

Local commit `eb1d7ccd163b361f748470adc455daf70bddfc51`, published as `27315faad862f71df940ed32bc4e5a98eca72e0d`. All eight commands in [manifest.json](manifest.json) passed in a clean detached checkout. Workspace links were verified to stay within this checkout; uncommitted demo and registry work was excluded. Raw command logs are adjacent.

Source: nine original-consumer cases including compiled findings/wait/resume. Compaction: twelve real Git/HTTP/store/CLI cases. Original compiler, three typechecks, remote runtime and fourteen retirement planner cases also pass. These are bounded local integration checks, not native cluster, full provider/model or complete delivery acceptance.
