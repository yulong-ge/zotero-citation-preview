# Build and maintenance scripts

Use the npm check/build entries rather than adding another scheduler. Changes to adopted checkers must retain provenance and regression coverage. Exercise valid and invalid inputs, subprocess failure propagation, and real partial staging when changing hooks. Never modify user hooks, a personal Zotero profile or files outside the selected test directory as a fallback.
