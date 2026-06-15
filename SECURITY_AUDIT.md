# Security Audit — Hermes_Agent_kanban_dashboard

**Audit date:** 2026-06-16
**Auditor:** worker3
**Status:** H-1, C-1 fixed in `server.js`; remaining issues documented below

---

## 🔴 High Risk (Fix Immediately)

### H-1: Path Traversal — FIXED ✅
**File:** `server.js:19-30`
**Original:** `req.url` passed directly to `readFileSync` without path normalization. `GET /../../etc/passwd` returned 200 with full contents.
**Fix:** Added `resolve()` + `startsWith(DIR + '/')` guard. Out-of-DIR requests now return 403.

### C-1: Snapshot Data Exposure — FIXED ✅
**File:** `server.js:31`
**Original:** Server bound to `0.0.0.0:3000`, no auth. Every task body / event payload / workspace_path was publicly accessible.
**Fix:** Changed bind to `127.0.0.1` only. Remote access now requires SSH tunnel or Cloudflare Tunnel.

### H-2: innerHTML Reconstruction (XSS Surface)
**File:** `app.js` — modal and card renderer
**Risk:** Uses `innerHTML` to rebuild DOM on every poll. Currently protected by `escapeHtml()`, but:
- No unit test coverage
- New fields added by future developers can easily bypass `escapeHtml()`
**Recommendation:** Migrate renderer to `createElement` + `textContent` pattern and add XSS regression tests.

### H-3: Shell Pipeline Race + Temp File Accumulation
**File:** `fetch_data.sh:111-127`
**Risk:**
- `mktemp` with unsanitized task id shape
- Subshell exit codes lost (`set -o pipefail` not set)
- `tasks/` directory accumulates `.t_*.XXXXXX` orphaned temp files on interrupt
**Fix:** Add `set -o pipefail`, sanitize task IDs before `mktemp`, add `trap` cleanup handler.

---

## 🟡 Medium Risk (Fix Soon)

### M-1: Profile Strip innerHTML (XSS Surface)
Profile status display rebuilds via `innerHTML` every second.

### M-2: Temp File Accumulation
`fetch_data.sh` temp files accumulate in `tasks/` directory. Currently cleaned manually.

### M-3: Error Banner Leaks Internal URLs
Error rendering directly interpolates `err.message` into DOM.

### M-4: Missing Security Headers
No `Content-Security-Policy`, `X-Frame-Options`, `Cache-Control: no-store` on sensitive responses.

---

## 🟢 Low Risk / Improvements

### L-1: No Log Rotation
All output via `console.log`, no log rotation.

### L-2: world-readable gateway.pid (644)
`~/.hermes/gateway.pid` is readable by any local user.

### L-3: No package.json / No Dependency Pinning
Zero dependencies, but also no `package.json` with locked versions.

### L-4: No Rate Limiting
`fetch_data.sh` can be hammered in a DoS scenario.

### L-5: 0% Test Coverage
`server.js` and `app.js` have zero automated tests.

---

## ✅ Verified Safe

- `escapeHtml()` function is correctly implemented and consistently applied
- `index.html` has no inline event handlers or untrusted interpolations
- `styles.css` has no `@import`, `expression`, or URL injection vectors
- `_loop.sh` (7 lines) is a simple while-sleep loop, no shell injection surface
- `app/poller.mjs`, `diff.mjs`, `filter.mjs` are pure functions with no external I/O

---

## Recommended Fix Priority

1. **H-1 path traversal** ✅ FIXED
2. **C-1 bind to localhost** ✅ FIXED
3. **H-3 shell race + tmp cleanup** (20 min)
4. **H-2 / M-1 XSS hardening** — migrate to `createElement` + `textContent`
5. **M-2..M-4 / L-1..L-5** — package as hardening PR

---

## Verification Commands

```bash
# Verify path traversal is blocked
curl --path-as-is http://127.0.0.1:3000/../../etc/passwd | head -3

# Verify snapshot not accessible externally
ss -tlnp | grep 3000
curl -s http://127.0.0.1:3000/snapshot.json | head -5

# Verify security headers
curl -sI http://127.0.0.1:3000/ | grep -iE 'content-security|cache-control|x-frame|x-content'
```
