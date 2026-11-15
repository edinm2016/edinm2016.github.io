# Local API prototype

This Node.js service serves the Assistant interface, receives tasks, creates Matrix Core plans, and stores tasks, plans, and events in SQLite. When configured, it can also send chat messages to an OpenAI Responses-compatible API. It does not execute Matrix modules or agents yet.

## Run locally

Requires Node.js 24 or newer. Copy `.env.example` to `.env`, add an API key and model name to `.env`, then run `npm start` from the repository root. Open `http://127.0.0.1:4173/` for the Assistant. `MATRIX_CHAT_API_URL` optionally overrides the default Responses endpoint. Use `http://127.0.0.1:4173/health` for service status. The `.env` file is ignored by Git; do not commit API keys.

By default the service binds to `127.0.0.1` and stores data in `data/matrix.sqlite`. Set `PORT` or `MATRIX_DB_PATH` to change these values. The API key stays on the server and is never returned to the browser. Chat history is stored in the browser; the current conversation is sent to the configured AI provider on each request. Responses use `store: false` where supported by the Responses API. Keep the host on loopback unless authentication, rate limiting, origin policy, and deployment security have been implemented.

The API is deliberately not wired into the public GitHub Pages site. Pages is static hosting and cannot run this server or protect provider secrets. Run the Node service locally or deploy it behind an authenticated, same-origin reverse proxy before using the public interface with an API key.
