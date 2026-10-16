// Ask ha-mon to re-check one site now, by writing its name to tmp/kpipe (the
// FIFO ha-mon reads; `echo <site> > ~/hamon/tmp/kpipe` does the same). For a
// blocked site that is the only way back short of editing its entry.
const fs = require('fs')

// { success, msg }. Opened non-blocking: with no reader (ha-mon stopped) the
// open fails with ENXIO instead of hanging this server
function recheck(kpipe, name, locations) {
  if (typeof name !== 'string' || !/^[\w.-]+$/.test(name)) {
    return { success: false, msg: 'Not a site name' }
  }
  const loc = Object.values(locations || {}).find((l) => l && l.name === name)
  if (!loc) return { success: false, msg: `${name} is not in hamon.yml` }
  if (loc.enabled !== true) return { success: false, msg: `${name} is disabled` }
  try {
    if (!fs.statSync(kpipe).isFIFO()) return { success: false, msg: `${kpipe} is not ha-mon's pipe` }
  } catch (err) {
    return { success: false, msg: `ha-mon's pipe not found (${err.code})` }
  }
  let fd
  try {
    fd = fs.openSync(kpipe, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)
    fs.writeSync(fd, `${name}\n`)
  } catch (err) {
    return { success: false, msg: err.code === 'ENXIO' ? 'ha-mon is not running' : `Re-check failed: ${err.message}` }
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
  return { success: true, msg: `${name}: re-check requested` }
}

module.exports = { recheck }
