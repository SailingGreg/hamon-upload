#!/usr/bin/env node
/*
 * hamon-yml-check.js  -  consistency check for hamon.yml
 *
 *   node hamon-yml-check.js [hamon.yml] [config-dir]
 *
 * Defaults to ../hamon/hamon.yml and ../hamon/config (hamon-upload sits next to
 * the hamon directory). Reports:
 *   issues  (x) - almost certainly wrong: bad YAML / duplicate keys, duplicate
 *                 location names, identical dns:port+phyAddr (tunnel conflict),
 *                 enabled site with empty dns/config, missing config xml.
 *   review  (!) - worth a look: same config xml used twice, disabled site with a
 *                 missing config.
 *   notes   (-) - informational: shared dns:port endpoint with distinct phyAddr
 *                 (one VPN/gateway monitored by several configs - usually fine).
 *
 * Exit 0 = no issues, 1 = issues found, 2 = file could not be parsed.
 * Note: phyAddr shared across *different* endpoints is normal (each site is its
 * own KNX bus) and is intentionally not reported.
 */
const fs = require('fs')
const path = require('path')

let yaml
for (const p of ['js-yaml', path.join(__dirname, 'node_modules/js-yaml'),
                 '/home/greg/hamon-upload/node_modules/js-yaml']) {
  try { yaml = require(p); break } catch (e) { /* try next */ }
}
if (!yaml) { console.error('cannot find js-yaml (run from the hamon-upload dir)'); process.exit(2) }

const YML = process.argv[2] || path.join(__dirname, '../hamon/hamon.yml')
const CONFIG_DIR = process.argv[3] || path.join(path.dirname(YML), 'config')

const raw = fs.readFileSync(YML, 'utf8')

// strict pass catches duplicate keys (js-yaml throws); lenient pass lets us keep
// analysing even if a duplicate key exists (last value wins)
let strictErr = null
try { yaml.load(raw) } catch (e) { strictErr = e.message }
let doc
try { doc = yaml.load(raw, { json: true }) } catch (e) {
  console.error('FATAL: could not parse YAML at all:', e.message); process.exit(2)
}

const issues = []
const review = []
const notes = []

if (strictErr) issues.push('YAML strict parse failed (duplicate key / syntax): ' + strictErr)

const locations = (doc && doc.locations) || {}
const keys = Object.keys(locations)
const label = (k) => `${k}${locations[k] && locations[k].name ? '/' + locations[k].name : ''}`

// group helper: value -> [labels]
const groupBy = (fn) => {
  const m = {}
  for (const k of keys) {
    const v = fn(locations[k] || {})
    if (v === undefined || v === null || v === '') continue
    ;(m[String(v)] = m[String(v)] || []).push(label(k))
  }
  return m
}

// per-location field checks
for (const k of keys) {
  const loc = locations[k] || {}
  if (loc.name === undefined || loc.name === '') issues.push(`${k}: missing/empty 'name'`)
  if (loc.enabled === true) {
    for (const f of ['dns', 'config']) {
      if (loc[f] === undefined || loc[f] === '') issues.push(`${label(k)}: ENABLED but '${f}' is empty`)
    }
  }
  if (loc.config) {
    const exists = fs.existsSync(path.join(CONFIG_DIR, loc.config))
    if (!exists) {
      (loc.enabled ? issues : review).push(
        `${label(k)}: config file missing -> config/${loc.config}${loc.enabled ? ' [ENABLED]' : ' [disabled]'}`)
    }
  }
}

// duplicate location names -> breaks restart.sh lookup and tags data ambiguously
for (const [v, w] of Object.entries(groupBy(l => l.name))) {
  if (w.length > 1) issues.push(`Duplicate location name '${v}' -> ${w.join(', ')}`)
}

// endpoints: identical dns:port+phyAddr is a real tunnel conflict; shared
// dns:port with distinct phyAddr is just a shared gateway (informational)
for (const [v, w] of Object.entries(groupBy(l => (l.dns && l.port) ? `${l.dns}:${l.port}:${l.phyAddr}` : ''))) {
  if (w.length > 1) issues.push(`Identical dns:port + phyAddr '${v}' (two tunnels clash) -> ${w.join(', ')}`)
}
for (const [v, w] of Object.entries(groupBy(l => (l.dns && l.port) ? `${l.dns}:${l.port}` : ''))) {
  if (w.length > 1) notes.push(`Shared endpoint '${v}' (one VPN/gateway, multiple configs) -> ${w.join(', ')}`)
}

// same config xml referenced by more than one location -> usually a mistake
for (const [v, w] of Object.entries(groupBy(l => l.config))) {
  if (w.length > 1) review.push(`Same config file '${v}' used by -> ${w.join(', ')}`)
}

// report
const enabled = keys.filter(k => locations[k] && locations[k].enabled === true).length
console.log(`${path.basename(YML)}: ${keys.length} locations (${enabled} enabled, ${keys.length - enabled} disabled)`)
const section = (title, arr, mark) => {
  console.log(`\n=== ${arr.length} ${title} ===`)
  arr.forEach(x => console.log(`  ${mark} ${x}`))
}
section('issue(s)', issues, 'x')
section('to review', review, '!')
section('note(s)', notes, '-')
process.exit(issues.length ? 1 : 0)
