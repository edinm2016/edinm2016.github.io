# Local API prototype

This Node.js service receives tasks, creates a Matrix Core plan, and stores tasks, plans, and events in SQLite. It does not execute modules or call AI providers yet.

## Run locally

Requires Node.js 24 or newer. From the repository root, run `npm start`, then use `http://127.0.0.1:4173/health` or submit a task to `POST /api/tasks`.

By default the service binds to `127.0.0.1` and stores data in `data/matrix.sqlite`. Set `PORT` or `MATRIX_DB_PATH` to change these values. Keep the host on loopback unless authentication, rate limiting, origin policy, and deployment security have been implemented.

The API is deliberately not wired into the public GitHub Pages site. Pages is static hosting and cannot run this server or protect provider secrets.
