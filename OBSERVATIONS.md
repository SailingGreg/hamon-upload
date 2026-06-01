# hamon-upload — review observations

Notes from a code review on 2026-06-01. Captured here so they're not lost.
hamon-upload is the HAMon ETS configuration utility (React SPA + Express
`backend.js`) that reads/writes the live `../hamon/hamon.yml` and moves location
config files into `../hamon/config/`. It runs as `hamon-upload.service`
(`node backend.js`) **as root**, HTTPS on `:8080`.

---

## 1. 🔴 Authentication is effectively bypassable  — FIXED on branch `fix/auth-validate-grafana-session`

**Where:** `backend.js` — `checkCookie()` (~line 62) and its callers in the three
route handlers.

**Two distinct problems:**

a) **Presence-only check.** `checkCookie` only tests that the `grafana_session`
   cookie *exists*; it never validates it. There's a TODO in the code admitting
   this. Any value (`grafana_session=anything`) passes.

b) **The check doesn't actually gate the request.** Handlers call
   `checkCookie(req, res)` **without `return`** and without `await`. So even when
   the cookie is missing, `checkCookie` fires off a `res.json(...)` but execution
   *continues* into the handler, which performs the file write/move and then sends
   a second response (triggering "Cannot set headers after they are sent"). Net:
   the protected operation (overwriting the live `hamon.yml` as root) runs anyway.

### Why "is it present?" was as far as we got
`grafana_session` is **not** a JWT or anything decodable — it's an **opaque,
server-side session token**. Grafana stores only its SHA-256 in `grafana.db`
(`user_auth_token` table); the cookie holds the raw token. It also **rotates**
(default `token_rotation_interval_minutes = 10`), so there is no static secret or
value to compare against. The only robust way to validate it is to **ask Grafana**.

### The fix — validate the session against Grafana's API
Grafana on this host serves HTTPS on `:3000`. `GET /api/user` with the session
cookie returns `200` + the user when the session is valid, `401` otherwise
(verified 2026-06-01: no cookie → 401, bogus cookie → 401, `/api/health` → 200).
The hamon-upload app sees the cookie because it's host-scoped
(`home.monitor-software.com`) and shared across ports `:3000`/`:8080`.

Replace the presence check with an async validator and make every handler gate on
it:

```js
const https = require('https')

// validate the grafana_session cookie by asking Grafana who the user is
function isAuthenticated(req) {
  return new Promise((resolve) => {
    const token = req.cookies[SECURITY_COOKIE_NAME]
    if (!token) return resolve(false)
    const r = https.request({
      host: 'localhost', port: 3000, path: '/api/user', method: 'GET',
      headers: { Cookie: `${SECURITY_COOKIE_NAME}=${token}` },
      rejectUnauthorized: false,   // loopback cert is for the public domain
      timeout: 3000,
    }, (resp) => { resp.resume(); resolve(resp.statusCode === 200) })
    r.on('error', () => resolve(false))
    r.on('timeout', () => { r.destroy(); resolve(false) })
    r.end()
  })
}
```

Then in each route (note `async` + `return`):

```js
if (!(await isAuthenticated(req))) {
  return res.status(401).json({ error: 'You are not logged in' })
}
```

**Optional hardening:** `/api/user` returns the user JSON — if only admins should
edit hamon config, also check `isGrafanaAdmin` / org role from that response rather
than accepting any logged-in Grafana user.

### Note on the "linked from the Grafana dashboard" approach
The app is reached via a link on the Grafana dashboard so it isn't advertised
externally. That's useful, but it's **obscurity, not access control** — the
`:8080` endpoint is still directly reachable by anyone who knows the URL,
regardless of the dashboard link. The Grafana-session validation above is the
actual control; the dashboard link is complementary (defence in depth: a user
following the link is already logged in, so they'll have a valid cookie).

### Status
Implemented in `backend.js`: `checkCookie` replaced with an async
`isAuthenticated(req)` that validates against Grafana `/api/user`; all three
handlers now `await` it and return `401` early (load/save → `{error}`, location
upload → `{success:false,msg}` to match what the React client already handles).
Dev (`NODE_ENV=development`) skips the live check since there's no local Grafana.
Overridable via `GRAFANA_AUTH_HOST` / `GRAFANA_AUTH_PORT` env vars.

---

## 2. 🟠 Runs as root and unzips user-supplied archives (zip-slip risk)

**Where:** `hamon-upload.service` (runs as root) + `src/backend/utils/etsProjectParser.js`.

The `.knxproj` upload is unzipped (`unzipper.Extract`) and, for encrypted projects,
entry paths are written directly: `fs.writeFileSync(outputDir + '/' + projectFile.path, ...)`
(~line 71). A malicious archive with `../` entries could write outside the work
folder — and the process is **root**. Recommend: validate/normalise each entry path
stays within the work dir, and run the service as a non-root user (e.g. `greg` or a
dedicated `hamon` user) with write access only to the dirs it needs.

---

## 3. 🟡 `dpt` vs `datapointType` field mismatch (DPT count always 0)

**Where:** `etsProjectParser.js:176` stores the parsed field as `dpt`, but
`backend.js:159` counts `groupAddresses[key].datapointType`. The two names never
match, so the "%d DPTs" tally is always 0. Likely related to hamon commit
`0b614d9 "Change dpt property creation to etsProjectParser"`. Pick one field name
and use it consistently on both sides.

---

## 4. 🟡 Race condition in the ETS parser

**Where:** `etsProjectParser.js` — `await Promise.all([parseProjectInformation(), parseProject()])`.

`parseProjectInformation()` reassigns `self.project = { ... }` (without
`groupAddresses`), while `parseProject()` pushes group addresses onto
`self.project.groupAddresses`, concurrently. A guard recreates the array if missing,
but if the reassignment lands after some addresses are pushed, they're lost. Works
today only because `project.xml` is tiny and resolves first. Make them sequential,
or have each write to its own field and merge afterwards.

---

## 5. ⚪ Minor: stale systemd unit comments

`hamon-upload.service` header is copy-pasted from the hamon server unit ("install to
ha-mon.service", "enable hamon.service"). Cosmetic, but misleading.

---

### Cross-reference
The timestamped `hamon.yml.<epoch-ms>` / `config/*.<ts>` backups this app creates on
every save (`saveFile`/`moveFile`, `Date.now()`) are cleaned up by
`../hamon/archive-hamonyml.sh` (weekly cron). The per-site `logging: info/debug`
selector here is the same log-level lever discussed for the hamon process log volume.
