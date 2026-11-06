# NexPlay — Custom HTML5 Player

A responsive, dark-purple video platform UI and custom HTML5 player prototype.

## Run locally
Requires Node.js 22.5 or newer (uses the built-in SQLite module).
```bash
npm install
npm run dev
```
This starts the SQLite API and Vite together; open the localhost URL Vite prints.

The SQLite database is created at `data/nexplay.sqlite` (override with `NEXPLAY_DATABASE_PATH`). `npm start` serves the production build and API on `http://127.0.0.1:4174` after `npm run build`.

## Test and build
```bash
npm test
npm run build
```

## Features
- Custom play/pause, timeline, volume/mute, playback speeds, ±10s seeking
- Theater/fullscreen, Picture-in-Picture, captions toggle (when tracks exist)
- Current, total and remaining time, buffered progress, loading state and detected video resolution
- Hover timeline frame previews, watch progress and configurable completion threshold (80%, 90% or 95%)
- SQLite-backed resume/watch-progress persistence with periodic and pause/seek saves
- Working sidebar navigation for Explore, My Videos, Watch Later, Liked Videos, History, Settings and Help
- Add videos by URL or local file; uploaded file bytes are stored in SQLite
- Downloads page with a device-download action and playback for each video
- Autoplay-next countdown with cancel
- Keyboard: Space, arrows, Shift+arrows, M, 1, P, T, C, F, N
- Responsive red-accent UI, Up Next and recommendation lists
- Local SQLite accounts with password hashing, sign-in, account creation and sign-out

## Notes
The SQLite API persists accounts, sessions, the video catalog, uploaded video bytes (up to 250 MB), watch progress, history, likes, Watch Later, completion preferences, and a premium-status flag. Account passwords are scrypt-hashed and sessions use HTTP-only, SameSite cookies. This is still a local demo: videos and app state are shared by all local accounts, so sign-in does not provide private per-account libraries or authorization for the other API routes. Do not expose it publicly without adding per-account data isolation, authorization, HTTPS, and a payment-provider integration. Premium status is not proof of payment, and payment details are never stored. Subscriptions and meetings remain demo placeholders. Device downloads from remote URLs require the remote host to allow cross-origin requests; uploaded videos download from the local API. The sample video URLs are public demo media; replace them with your licensed video URLs. Timeline previews use a separate paused video element to show frames from the current source. Browser support for PiP, captions and fullscreen varies.
