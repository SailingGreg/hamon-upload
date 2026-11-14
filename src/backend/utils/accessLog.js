// who uses hamon-upload, as one JSON line per event in logs/access.jsonl:
// { t, action, user, id, role, admin, ip, detail }
//
// Every change (save, location upload, re-check) is logged. Reads (load,
// dns-status, site-state - the page polls these) are logged as one `visit`
// per user and IP an hour, and refusals as one `refused` per IP and reason
// an hour, so scanners and the status polling don't flood the file. Nothing
// here decides access: it is the record for choosing the Grafana role
// mapping later (utils/grafana-logins.py in hamon reports on it)
const fs = require('fs')
const path = require('path')

const HOUR = 60 * 60 * 1000

class AccessLog {
  constructor(file, { now = () => Date.now(), write = null } = {}) {
    this.file = file
    this.now = now
    this.write = write || ((line) => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.appendFileSync(this.file, line + '\n')
    })
    this.recent = new Map() // de-dupe key -> when last logged
  }

  // log once per key per hour; true when it was logged
  once(key, entry) {
    const t = this.now()
    const last = this.recent.get(key)
    if (last != null && t - last < HOUR) return false
    this.recent.set(key, t)
    if (this.recent.size > 5000) { // keep the map small: drop the stale ones
      for (const [k, v] of this.recent) if (t - v >= HOUR) this.recent.delete(k)
    }
    this.log(entry)
    return true
  }

  log(entry) {
    const line = JSON.stringify({ t: new Date(this.now()).toISOString(), ...entry })
    try { this.write(line) } catch (err) { console.error('access log:', err.message) }
  }

  // a read by a logged-in user
  visit(user, ip) {
    return this.once(`visit ${user.id} ${ip}`, { action: 'visit', ...who(user), ip })
  }

  // a change by a logged-in user: always logged, and to the journal
  change(user, ip, action, detail) {
    this.log({ action, ...who(user), ip, detail })
    console.log(`access: ${action} by ${user.login} (${user.role}) from ${ip}` + (detail ? `: ${detail}` : ''))
  }

  // no session or a dead one
  refused(ip, reason, route) {
    return this.once(`refused ${ip} ${reason}`, { action: 'refused', ip, reason, route })
  }
}

function who(user) {
  return { user: user.login, id: user.id, role: user.role, admin: !!user.isGrafanaAdmin }
}

// the client's address: nginx's X-Forwarded-For first entry, else the socket
function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return (req.socket && req.socket.remoteAddress) || ''
}

// what a save changes, by site name and top-level key: "changed a, b; added
// c; removed d; top-level silence". Location keys (Location-N) don't count,
// only names and contents. 'no change' when nothing changed
function configChanges(before, after) {
  const byName = (doc) => {
    const m = new Map()
    for (const loc of Object.values((doc && doc.locations) || {})) if (loc && loc.name != null) m.set(String(loc.name), JSON.stringify(sorted(loc)))
    return m
  }
  const a = byName(before)
  const b = byName(after)
  const changed = [...b.keys()].filter((n) => a.has(n) && a.get(n) !== b.get(n))
  const added = [...b.keys()].filter((n) => !a.has(n))
  const removed = [...a.keys()].filter((n) => !b.has(n))
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  keys.delete('locations')
  const top = [...keys].filter((k) => JSON.stringify(sorted((before || {})[k])) !== JSON.stringify(sorted((after || {})[k])))
  const parts = []
  if (changed.length) parts.push(`changed ${changed.join(', ')}`)
  if (added.length) parts.push(`added ${added.join(', ')}`)
  if (removed.length) parts.push(`removed ${removed.join(', ')}`)
  if (top.length) parts.push(`top-level ${top.join(', ')}`)
  return parts.length ? parts.join('; ') : 'no change'
}

// a value with its object keys in order, so key order doesn't count as a change
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]))
  return v
}

module.exports = { AccessLog, clientIp, configChanges }
