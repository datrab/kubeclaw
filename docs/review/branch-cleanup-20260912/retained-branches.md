# Branch retention after consolidation

Only `main` must remain. All 261 frozen non-main tips are to be preserved as parents of the consolidation commit. Open acceptance and live tests remain open; their presence does not require retaining branch refs. See `branches.json` for exact names and SHAs and `residual-resolutions.json` for superseded source versions. Actual remote deletion is pending authenticated Git access.
