// Resolve each location's dns the way a hamon worker does (IPv4
// lookup through the system resolver) so the UI can flag sites that cannot
// connect. Kept out of /load-configuration-file on purpose: that response is
// posted back on save, so anything added to it would land in hamon.yml.
const dns = require('dns').promises
const net = require('net')

const LOOKUP_TIMEOUT_MS = 5000

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('lookup timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function checkHost(host) {
  if (!host) return { ok: false, error: 'no dns entry' }
  if (net.isIP(host)) return { ok: true, address: host }
  try {
    const { address } = await withTimeout(dns.lookup(host, { family: 4 }), LOOKUP_TIMEOUT_MS)
    return { ok: true, address }
  } catch (err) {
    return { ok: false, error: err.code === 'ENOTFOUND' ? 'does not resolve' : err.message }
  }
}

// returns { locationKey: { dns, ok, address?, error? } } - disabled sites too,
// so enabling one in the UI shows its state without a save
async function dnsStatus(locations) {
  const entries = Object.entries(locations || {}).filter(([, loc]) => loc)
  const results = await Promise.all(entries.map(([, loc]) => checkHost(String(loc.dns || '').trim())))
  // echo the dns checked so the UI can tell a result from an edited entry
  return Object.fromEntries(entries.map(([key, loc], i) => [key, { dns: String(loc.dns || '').trim(), ...results[i] }]))
}

module.exports = { dnsStatus, checkHost }
