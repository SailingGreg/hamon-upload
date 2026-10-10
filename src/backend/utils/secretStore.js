/*
 * secretStore.js - per-location secrets kept out of hamon.yml
 *
 * hamon.yml is backed up nightly and archived weekly in plain text, so
 * passwords live in a separate JSON file next to it, mode 600 and owned like
 * the directory it is in (~/hamon: hamon.yml itself is root's once this app has
 * written it), so the nightly backup, which runs as that user, can include it:
 *
 *   { "<location name>": { "configPass": "..." } }
 *
 * Keyed by location name: names of existing sites never change.
 *
 * The browser never sees a stored secret, only STORED in its place. On save a
 * secret field means:  undefined or STORED - keep what is stored;
 *                      ''                  - remove it;
 *                      anything else       - store it.
 * Secret fields are always removed from the location before hamon.yml is written.
 */

const fs = require('fs')
const path = require('path')

const SECRET_KEYS = ['configPass']
const STORED = '__stored__'

// a missing file is an empty store; an unreadable one throws, so a save fails
// rather than overwriting the store with nothing
function readSecrets(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw err
  }
}

function writeSecrets(file, secrets, ownerOf) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 })
  fs.chmodSync(tmp, 0o600)   // mode only applies when the file is created
  try {
    const { uid, gid } = fs.statSync(ownerOf)
    fs.chownSync(tmp, uid, gid)
  } catch (err) {
    // not root (development) or no hamon.yml yet: keep our own ownership
  }
  fs.renameSync(tmp, file)
}

// load: replace stored secrets with STORED. A plaintext secret still in
// hamon.yml (from before the store) is passed on, and moves to the store on
// the next save
function maskSecrets(configFile, file) {
  const secrets = readSecrets(file)
  for (const key in (configFile?.locations || {})) {
    const loc = configFile.locations[key]
    const stored = secrets[loc?.name] || {}
    for (const k of SECRET_KEYS) {
      if (stored[k] !== undefined) loc[k] = STORED
    }
  }
  return configFile
}

// save: move secret fields out of the locations into the store, and drop
// entries for locations that no longer exist
function extractSecrets(configFile, file, ownerOf) {
  const secrets = readSecrets(file)
  const before = JSON.stringify(secrets)
  const names = new Set()
  for (const key in (configFile?.locations || {})) {
    const loc = configFile.locations[key]
    if (!loc) continue
    const name = loc.name
    if (name) names.add(name)
    for (const k of SECRET_KEYS) {
      const value = loc[k]
      delete loc[k]
      if (!name || value === undefined || value === null || value === STORED) continue
      if (value === '') {
        if (secrets[name]) delete secrets[name][k]
      } else {
        secrets[name] = { ...secrets[name], [k]: String(value) }
      }
    }
  }
  for (const name of Object.keys(secrets)) {
    if (!names.has(name) || Object.keys(secrets[name]).length === 0) delete secrets[name]
  }
  if (JSON.stringify(secrets) !== before) writeSecrets(file, secrets, ownerOf)
  return configFile
}

module.exports = { maskSecrets, extractSecrets, SECRET_KEYS, STORED }
