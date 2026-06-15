# Kanban Dashboard

> Real-time Hermes Kanban task board with live worker status and polling updates.

**Live Demo**: `http://140.245.120.154:3000/`  
**Repository**: [HTTP404Not-Found/Hermes_Agent_kanban_dashboard](https://github.com/HTTP404Not-Found/Hermes_Agent_kanban_dashboard)

---

## Features

- **Real-time polling** — Snapshot refreshes every 1 second (configurable)
- **Live worker status** — Shows online/offline state for `default`, `worker1`, `worker2`, `worker3` profiles via `gateway.pid` health checks
- **Task card grid** — All Kanban tasks rendered as cards with status badges, assignee, and age
- **Expand/collapse** — Shows first 8 cards by default; click "show more" to expand all
- **Filter bar** — Filter by task status, assignee, or sort order
- **Task detail modal** — Click any card to view full task details, comments, and activity log
- **Dark tech theme** — CSS animations: fade-in on load, hover lift effect, online pulse indicator
- **Zero dependencies** — Pure vanilla JS, no npm packages required for the frontend

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                             │
│  index.html + app.js + styles.css                               │
│  ├── Poller: fetches snapshot.json every 1s                     │
│  ├── State: in-memory store (tasks, profiles, filter, UI)      │
│  └── Renderer: rebuilds task grid, opens modals                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ GET /snapshot.json
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Static Server (Node.js server.js OR python3 -m http.server)   │
│  Port 3000 | Serves /tmp/kanban-dashboard/ as static files    │
└────────────────────────┬────────────────────────────────────────┘
                         │ cron / _loop.sh (every 1s)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  fetch_data.sh                                                      │
│  ├── hermes kanban list --json                                   │
│  ├── hermes kanban assignees --json                              │
│  ├── gateway.pid health checks (kill -0)                          │
│  └── Writes: /tmp/kanban-dashboard/snapshot.json                 │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Hermes Kanban DB & Gateway Processes                            │
│  ├── ~/.hermes/kanban.db (SQLite)                               │
│  ├── ~/.hermes/gateway.pid         (default profile)            │
│  └── ~/.hermes/profiles/{worker1,2,3}/gateway.pid              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), no framework
- **Static Server**: Node.js `http` module (`server.js`)
- **Data Collection**: Bash script + Python3 JSON processing
- **Styling**: Pure CSS with CSS custom properties, keyframe animations
- **Backend**: Hermes Agent CLI (`hermes kanban list/assignees`)

---

## Quick Start

### 1. Start the static server

```bash
# Option A: Node.js (recommended)
node /tmp/kanban-dashboard/server.js

# Option B: Python
cd /tmp/kanban-dashboard && python3 -m http.server 3000
```

### 2. Start the polling loop

```bash
# Run once (manual)
bash /tmp/kanban-dashboard/fetch_data.sh

# Or run continuously (1s interval)
bash /tmp/kanban-dashboard/_loop.sh &
```

### 3. Open in browser

```
http://localhost:3000/
```

For remote access: `http://140.245.120.154:3000/`

---

## File Structure

```
kanban-dashboard/
├── index.html          # Main HTML entry point
├── app.js             # SPA logic: polling, state, rendering, modals
├── styles.css         # Dark theme + CSS animations
├── server.js          # Node.js static file server (port 3000)
├── fetch_data.sh      # Fetches kanban data + profile health checks
├── _loop.sh           # Wrapper: runs fetch_data.sh every 1s
├── snapshot.json      # Generated output (refreshed every 1s)
├── architecture.md    # System architecture documentation
├── tasks.md           # Development task tracker
├── research-plan.md   # Feature research notes
├── sample-snapshot.json # Example snapshot for offline dev
└── screenshots/       # UI screenshots
```

---

## Polling & Performance

| Operation | Time |
|-----------|------|
| `hermes kanban list --json` | ~0.5s |
| `hermes kanban assignees --json` | ~0.5s |
| Per-task detail fetch (×N tasks, parallel) | ~1.0s total |
| **Total snapshot refresh** | **~1.1s** |
| Configurable polling interval | Default: 1s (`_loop.sh`) |

Task detail fetching is **parallelized** using background subprocesses (`&` + `wait`) — adding more tasks does not linearly increase fetch time.

---

## Profile Health Check

Each profile's `gateway.pid` is checked with `kill -0`:

| Profile | PID File Location |
|---------|------------------|
| `default` | `~/.hermes/gateway.pid` |
| `worker1` | `~/.hermes/profiles/worker1/gateway.pid` |
| `worker2` | `~/.hermes/profiles/worker2/gateway.pid` |
| `worker3` | `~/.hermes/profiles/worker3/gateway.pid` |

- PID file missing → `OFFLINE · no_pid_file` (legal state, not an error)
- PID file exists but process dead → `OFFLINE · pid_dead`

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

### Public access (no auth)

The dashboard has no built-in authentication. Expose via Cloudflare Tunnel or restrict at the network level:

```bash
# Bind to localhost only (local access only)
node /tmp/kanban-dashboard/server.js  # already binds 0.0.0.0:3000

# For public access, use Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

---

## Customization

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL` | `1` | Seconds between fetch cycles |
| `INITIAL_DISPLAY` | `8` | Cards shown before "show more" |

Edit `_loop.sh` to change polling interval:
```bash
POLL_INTERVAL=5  # change to 5 seconds
```

Edit `app.js` to change initial card display:
```javascript
const INITIAL = 8;  // change to show more/fewer cards by default
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Dashboard shows `OFFLINE · no_pid_file` for all profiles | `fetch_data.sh` looking at wrong pid path | Ensure `~/.hermes/gateway.pid` exists for `default`; `~/.hermes/profiles/*/gateway.pid` for workers |
| Snapshot not updating | `_loop.sh` not running | Run `bash /tmp/kanban-dashboard/_loop.sh &` |
| 0 tasks shown | `hermes kanban list` returning empty | Check `hermes kanban list --json` output manually |
| Browser shows stale data | Caching issue | Hard refresh (Ctrl+Shift+R) or check `snapshot.json` modification time |

---

## License

MIT
