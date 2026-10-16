// What hamon itself knows about each site, from the tmp/site-state.json that
// ha-mon (service.js) writes on every change: connected, starting, down (in
// restart back-off), blocked (e.g. its dns doesn't resolve) or disabled.
// Read-only here - hamon owns the file. Like /dns-status, kept out of
// /load-configuration-file so none of it can be posted back into hamon.yml.
const fs = require('fs')

// is that pid still ha-mon? ha-mon runs as root and this as greg, so
// kill(pid, 0) gives EPERM for a live process; /proc/<pid>/cmdline (world
// readable) guards against the pid having been reused
function hamonAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch (err) {
    if (err.code !== 'EPERM') return false
  }
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('hamon.js')
  } catch (err) {
    return err.code !== 'ENOENT' // no /proc (not Linux): trust kill()
  }
}

// { available: false } when there's no file (ha-mon too old, or never run);
// otherwise { available, running, updated, sites: { <site name>: {...} } }.
// running is false when ha-mon has stopped, so the states are the last known
function siteState(file) {
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return { available: false, error: err.code === 'ENOENT' ? 'no site state from hamon' : err.message }
  }
  if (!doc || typeof doc.sites !== 'object' || doc.sites === null) {
    return { available: false, error: 'site state file not in the expected form' }
  }
  return {
    available: true,
    running: doc.running !== false && hamonAlive(doc.pid),
    updated: doc.updated || null,
    sites: doc.sites,
  }
}

module.exports = { siteState, hamonAlive }
