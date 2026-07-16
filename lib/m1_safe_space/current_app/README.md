Current M1 app safe space.

This folder is the frozen reference snapshot of the full current M1 app state.

Rules:
- do not edit the live app by changing files inside this safe space
- read from this safe space freely for reference
- if a future change is needed, copy the required file or flow into a new working area and edit the new copy
- promote new working code into a safe space only after the flow is confirmed complete

Contents:
- `frontend/`: snapshot of the current Flutter `lib/` source as `.txt`
- `backend/`: mirror snapshot of the current Node backend source as `.txt`
- `project/`: snapshot of current desktop and project files as `.txt`
  Includes `macos/`, `documentation/`, `test/`, and key root config files.

Notes:
- snapshots are stored as plain text on purpose so tooling does not treat them as active source
- generated dependency folders and local environment folders are intentionally excluded
