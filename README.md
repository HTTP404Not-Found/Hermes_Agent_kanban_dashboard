# Kanban Dashboard

> Real-time Hermes Kanban task board with live worker status and polling updates.

**Live Demo**: `http://140.245.120.154:3000/`  
**Repository**: [HTTP404Not-Found/Hermes_Agent_kanban_dashboard](https://github.com/HTTP404Not-Found/Hermes_Agent_kanban_dashboard)

A single-page web frontend that visualizes the state of a running [Hermes Agent](https://github.com) Kanban DB: live task cards, per-profile gateway health, task detail modals, and status / assignee / sort filters. The frontend is plain HTML + vanilla JS; the backend is a small bash + Python pipeline that snapshots Hermes CLI output to JSON files which the static server serves.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Quick Start](#quick-start)
5. [Project Layout](#project-layout)
6. [Polling & Performance](#polling-performance)
7. [Profile Health Check](#profile-health-check)
8. [Run the Test Suite](#run-the-test-suite)
9. [Deployment](#deployment)
10. [Customization](#customization)
11. [Troubleshooting](#troubleshooting)
12. [Versioning & Docs Map](#versioning-docs-map)
13. [License](#license)

---

## Features

- **Real-time polling** — Snapshot refreshes every 1 second (configurable).
- **Live worker status** — Online / offline indicator for the `default`, `worker1`, `worker2`, `worker3` profiles via `gateway.pid` health checks.
- **Task card grid** — All Kanban tasks rendered as cards with status badge, assignee, age, and title.
- **Expand / collapse** — Shows the first 8 cards by default; click "show more" to reveal all.
- **Filter bar** — Filter by task status, assignee, or change the sort order (newest / oldest / status).
- **Task detail modal** — Click any card to view full task description, comments, activity events, and parent / child links.
- **Dark tech theme** — CSS animations: fade-in on load, hover lift, online pulse dot.
- **Pure vanilla JS** — No build step, no npm packages, no bundler. Open `index.html` and go.
- **Backend in 3 small modules** — `app/poller.mjs`, `app/diff.mjs`, `app/filter.mjs` — each unit-tested.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (SPA)                              │
│  index.html + app.js + styles.css                                │
│  ├── Poller  (app/poller.mjs)  ── polls /snapshot.json           │
│  ├── Diff    (app/diff.mjs)    ── added/removed/changed events   │
│  ├── Filter  (app/filter.mjs)  ── status / assignee / sort       │
│  └── Renderer                  ── rebuilds grid + opens modals   │
└───────────────────────────┬──────────────────────────────────────┘
                            │ GET /snapshot.json  +  GET /tasks/<id>.json
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Static Server (Node server.js  OR  python3 -m http.server)      │
│  Port 3000  ·  Serves /tmp/kanban-dashboard/ as static files     │
└───────────────────────────┬──────────────────────────────────────┘
                            │ every 1s
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  fetch_data.sh                                                   │
│  ├── hermes kanban list --json                                   │
│  ├── hermes kanban assignees --json                              │
│  ├── gateway.pid health checks  (kill -0 per profile)            │
│  ├── Writes /tmp/kanban-dashboard/snapshot.json                 │
│  └── Writes /tmp/kanban-dashboard/tasks/<id>.json  (in parallel) │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Hermes Kanban DB  &  Gateway Processes                          │
│  ├── ~/.hermes/kanban.db                    (SQLite)             │
│  ├── ~/.hermes/gateway.pid                  (default profile)    │
│  └── ~/.hermes/profiles/<name>/gateway.pid  (worker1/2/3)        │
└──────────────────────────────────────────────────────────────────┘
```

Data flows one way: CLI → `snapshot.json` → HTTP → browser modules → DOM. Each browser module is a pure function on a snapshot — easy to test, easy to swap.

For deeper design notes, see [`architecture.md`](./architecture.md) (v1.1.0) and [`research-plan.md`](./research-plan.md).

---

## Tech Stack

| Layer       | Choice                                                        |
|-------------|---------------------------------------------------------------|
| Frontend    | Vanilla JavaScript (ES2022), no framework, no build step      |
| UI modules  | 3 pure-function modules in `app/` (poller, diff, filter)      |
| Styling     | Pure CSS with custom properties + keyframe animations         |
| Static srv  | Node.js `http` module (`server.js`, ESM, MIME map for `.mjs`) |
| Snapshotter | Bash (`fetch_data.sh`) + Python3 heredoc for JSON composition  |
| Poller loop | Bash (`_loop.sh`, `sleep 1` wrapper)                          |
| Backend     | Hermes Agent CLI (`hermes kanban list/assignees/show`)         |

Node.js ≥ 18 is required for the `node:http`, `node:fs/promises`, and `node:test` APIs.

---

## Quick Start

### 1. Start the static server

```bash
# Option A — Node.js (recommended, supports .mjs MIME)
node /tmp/kanban-dashboard/server.js

# Option B — Python 3 (no Node dependency)
cd /tmp/kanban-dashboard && python3 -m http.server 3000
```

The Node server binds `0.0.0.0:3000` (any interface, port 3000). Tail the log:

```bash
tail -f /tmp/kanban-dashboard/server.log   # if you redirect stdout yourself
```

### 2. Start the polling loop

```bash
# Run once (manual refresh)
bash /tmp/kanban-dashboard/fetch_data.sh

# Run continuously (every 1s)
bash /tmp/kanban-dashboard/_loop.sh &
```

`fetch_data.sh` is idempotent and writes `snapshot.json` atomically (tmp + `mv`) so the browser never sees a half-written file.

### 3. Open in browser

```
http://localhost:3000/
```

Remote access: `http://140.245.120.154:3000/`

---

## Project Layout

```
kanban-dashboard/
├── index.html            # Main HTML entry point  (lang="zh-Hant", single page)
├── app.js                # SPA bootstrap + DOM glue (calls into app/* modules)
├── styles.css            # Dark theme + CSS animations
│
├── app/                  # Browser-side pure-function modules  (ESM)
│   ├── poller.mjs        #   Polls /snapshot.json with start/pause/resume API
│   ├── diff.mjs          #   Computes added / removed / changed events
│   └── filter.mjs        #   Filter by status / assignee + sort orders
│
├── tests/                # Node.js native test runner  (node --test)
│   ├── poller.test.mjs   #   9 tests
│   ├── diff.test.mjs     #   9 tests
│   └── filter.test.mjs   #  16 tests
│
├── server.js             # Node.js static file server  (port 3000)
├── fetch_data.sh         # Snapshots Hermes CLI output → snapshot.json + tasks/<id>.json
├── _loop.sh              # Wrapper: runs fetch_data.sh every 1s
│
├── snapshot.json         # Generated output  (refreshed every 1s)
├── tasks/<id>.json       # Per-task detail files  (events, comments, parent / child links)
│
├── architecture.md       # System architecture doc  (v1.1.0)
├── tasks.md              # Development task tracker
├── research-plan.md      # Feature research notes
├── SECURITY_AUDIT.md     # Security audit checklist
├── sample-snapshot.json  # Offline-development fixture
```

---

## Polling & Performance

| Operation                                       | Time           |
|-------------------------------------------------|----------------|
| `hermes kanban list --json`                     | ~0.5 s         |
| `hermes kanban assignees --json`                | ~0.5 s         |
| Per-task detail fetch (N tasks, **parallel**)   | ~1.0 s total   |
| **Total snapshot refresh**                      | **~1.1 s**     |
| Browser-side poll cadence                       | 1 s (configurable) |

Per-task detail files (`tasks/<id>.json`) are fetched in parallel using background subprocesses (`&` + `wait`). Adding more tasks does **not** linearly increase fetch time — the entire detail batch caps around 1 s regardless of task count.

The browser-side `app/poller.mjs` exposes `start / stop / pause / resume / trigger / setInterval`, which the SPA uses to keep polling live without piling up requests while the tab is hidden (the `document.visibilitychange` hook pauses the poller).

---

## Profile Health Check

Each profile's `gateway.pid` is checked with `kill -0` from `fetch_data.sh`. The `default` profile uses a non-standard path:

| Profile   | PID file path                          |
|-----------|----------------------------------------|
| `default` | `~/.hermes/gateway.pid`                |
| `worker1` | `~/.hermes/profiles/worker1/gateway.pid` |
| `worker2` | `~/.hermes/profiles/worker2/gateway.pid` |
| `worker3` | `~/.hermes/profiles/worker3/gateway.pid` |

State semantics (these are normal, not errors):

- **ONLINE** — PID file present + process responds to `kill -0`.
- **OFFLINE · no_pid_file** — PID file absent (the profile has not been launched yet — legal).
- **OFFLINE · pid_dead** — PID file present but the process is no longer alive.

`fetch_data.sh` deliberately does not use `set -e`, because `hermes kanban list` can occasionally return non-zero on a race; writing a partial snapshot beats writing nothing.

---

## Run the Test Suite

The three browser modules each have a dedicated `node --test` file. There are **34 tests total, all passing**:

```bash
cd /tmp/kanban-dashboard

# Run the full suite
node --test tests/*.test.mjs

# Run one file at a time
node --test tests/poller.test.mjs
node --test tests/diff.test.mjs
node --test tests/filter.test.mjs
```

Expected output (last 3 lines):

```
# tests 34
# pass 34
# fail 0
```

The tests use Node's built-in test runner — no third-party framework. They run in-process, so they are fast (< 1 s for 34 tests) and require no extra setup.

---

## Deployment

### systemd service (recommended for production)

```ini
[Unit]
Description=Hermes Kanban Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/node /tmp/kanban-dashboard/server.js
Restart=always
WorkingDirectory=/tmp/kanban-dashboard

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable kanban-dashboard
systemctl --user start kanban-dashboard
```

The polling loop (`_loop.sh`) is meant to run as a separate systemd `--user` service or under `tmux` / `screen` / `nohup`. There is no built-in supervisor — pick whichever fits your ops model.

### Public access (no built-in auth)

The dashboard has no authentication. Bind to localhost only, or expose through Cloudflare Tunnel:

```bash
# Default — binds 0.0.0.0:3000 (any interface)
node /tmp/kanban-dashboard/server.js

# Recommended for public access
cloudflared tunnel --url http://localhost:3000
```

Do not expose port 3000 directly to the internet without an auth layer in front of it — `snapshot.json` and `tasks/<id>.json` are world-readable.

---

## Customization

| Variable        | Default | Where to change                | Effect                          |
|-----------------|---------|--------------------------------|---------------------------------|
| `POLL_INTERVAL` | `1`     | `_loop.sh` (`sleep` argument)  | Seconds between snapshot writes |
| `INITIAL`       | `8`     | `app.js` (line ~187)           | Cards shown before "show more"  |
| `PORT`          | `3000`  | `server.js` (`PORT` constant)  | Static server port              |

Edit `_loop.sh` to slow the polling cadence (useful on low-power dev boxes):

```bash
sleep 5   # was 1 — refresh every 5 seconds
```

Edit `app.js` to change the initial card cap:

```javascript
const INITIAL = 12;  // was 8 — show 12 cards before "show more"
```

---

## Troubleshooting

| Symptom                                                 | Cause                                          | Fix                                                                                          |
|---------------------------------------------------------|------------------------------------------------|----------------------------------------------------------------------------------------------|
| All profiles show `OFFLINE · no_pid_file`               | `fetch_data.sh` is looking at the wrong path   | Confirm `~/.hermes/gateway.pid` exists for `default`; `~/.hermes/profiles/*/gateway.pid` for workers |
| Snapshot not updating                                   | `_loop.sh` not running                         | `bash /tmp/kanban-dashboard/_loop.sh &`                                                      |
| Dashboard shows 0 tasks                                 | `hermes kanban list` returning empty           | `hermes kanban list --json` manually; check DB path                                          |
| Browser shows stale data                                | Caching or stale `snapshot.json`               | Hard refresh (Ctrl+Shift+R); check `ls -l /tmp/kanban-dashboard/snapshot.json` mtime         |
| `.mjs` files served as `text/plain`                     | Server doesn't map the MIME type               | Use the Node `server.js` (it has the MIME map); the Python server may not                       |
| Modal opens but no events / comments                    | `tasks/<id>.json` not being written            | Verify `fetch_data.sh` has write permission to `tasks/` and that the parallel `&` jobs ran   |
| `node --test` reports `fail 1` when running the folder | Known race when loading all 3 files at once    | Run files individually, or `node --test tests/*.test.mjs` (the glob fixes it)                 |

---

## Versioning & Docs Map

| Doc                    | Version | Purpose                                              |
|------------------------|---------|------------------------------------------------------|
| `README.md` (this file) | v1.2.0  | User-facing onboarding & ops guide (English)        |
| `README.zh.md`          | v1.2.0  | User-facing onboarding & ops guide (中文)            |
| `architecture.md`       | v1.1.0  | Design doc — modules, data flow, error handling     |
| `research-plan.md`      | v1.1.0  | Feature research, user stories, risk matrix         |
| `tasks.md`              | v1.2.0  | Per-task development tracker                         |
| `SECURITY_AUDIT.md`     | v1.2.0  | Security audit checklist                              |

Every shipped source file carries a `<!-- v1.0.0 | 2026-06-15 -->` marker so you can `grep` the codebase to see exactly which files belong to the v1.0.0 release:

```bash
grep -rn "v1.0.0 | 2026-06-15" .
```

---

## License

MIT