#!/usr/bin/env node
/*
 * File: backend.js - simple file backend for HAMon ETS configuration upload utility
 *
 *
 */

const express = require('express');
const http = require('http'); // added for ssl support
const https = require('https');
const fileupload = require("express-fileupload");
const cookieParser = require("cookie-parser");
const bodyParser = require('body-parser');
const yaml = require('js-yaml');
const app = express();
const port = process.env.PORT || 8080;
const fs = require('fs');
const path = require('path');
const { etsProjectParser } = require('./src/backend/utils/etsProjectParser');
const { maskSecrets, extractSecrets, writePrivateJson } = require('./src/backend/utils/secretStore');
const { describeSecure, secureEntryFor } = require('./src/backend/utils/etsSecure');
const { dnsStatus } = require('./src/backend/utils/dnsStatus');
const { siteState } = require('./src/backend/utils/siteState');
const { recheck } = require('./src/backend/utils/recheck');
const NODE_ENV = process.env.NODE_ENV || 'development';

// for production
const key_file = "/etc/letsencrypt/live/home.monitor-software.com/privkey.pem"
// fullchain, not cert.pem: clients need the intermediate to verify the leaf
const cert_key = "/etc/letsencrypt/live/home.monitor-software.com/fullchain.pem"
const ca_file = "/etc/letsencrypt/live/home.monitor-software.com/chain.pem"
const dev_cert = __dirname + "/../certs/selfsigned.crt"
const dev_key = __dirname + "/../certs/selfsigned.key"

//--- !!!! CONFIGURATION !!!! ---//
// Note this is where the configuration and location files reside
// the location .xml need to be moved here
const CONFIGURATION_FILE_LOCATION = __dirname + '/../hamon'
// const CONFIGURATION_FILE_LOCATION = __dirname + '/uploads'
const CONFIGURATION_FILE_NAME = 'hamon.yml'
const LOCATION_CONFIGURATION_FILES_LOCATION = __dirname + '/uploads/'
const LOCATION_CONFIGURATION_FILES_DESTINATION = '/config/'
// SETUP THIS ONLY IF WE ARE READING CONFIG FROM OTHER PLACE, FOR EXAMPLE WE WANT USER TO NOT OVERRIDE BASIC CONFIGURATION AND SAVE IT SOMEWHERE ELSE
const READ_CONFIGURATION_FILE_FROM = __dirname + '/../hamon'
// per-location passwords (ETS project password, later KNX Secure), never in
// hamon.yml - see src/backend/utils/secretStore.js
const SECRETS_FILE = CONFIGURATION_FILE_LOCATION + '/.hamon-secrets.json'
// const READ_CONFIGURATION_FILE_FROM = __dirname + '/example-files'
const SECURITY_COOKIE_NAME = 'grafana_session'
//--- !!!! END OF CONFIGURATION !!!! ---//

app.use(express.static(__dirname + '/dist'));
app.use('/static', express.static(__dirname + '/dist/static'));
app.use(cookieParser());
app.use(fileupload());
app.use(bodyParser.json());

const locationTemplate = {
  name: "",
  desc: "",
  enabled: false,
  hapi: false,
  dns: "",
  port: 1371,
  device: "generic",
  phyAddr: "15.15.15",
  logging: 'info',
  config: ""
}

// --- auth: validate the grafana_session cookie against Grafana ---
// grafana_session is an opaque, rotating, server-side token (not a JWT), so it
// cannot be verified locally. We ask Grafana who the user is: GET /api/user with
// the cookie returns 200 for a live session, 401 otherwise. The cookie is shared
// because Grafana and this app are on the same host (different ports).
const GRAFANA_AUTH_HOST = process.env.GRAFANA_AUTH_HOST || 'localhost'
const GRAFANA_AUTH_PORT = process.env.GRAFANA_AUTH_PORT || 3000
// 'http' once Grafana sits behind nginx on plain http
const GRAFANA_AUTH_PROTO = process.env.GRAFANA_AUTH_PROTO || 'https'

function isAuthenticated(req) {
  // Development is served over plain HTTP locally with no Grafana to validate
  // against, so skip the live check to keep the dev workflow usable.
  if (NODE_ENV === 'development') return Promise.resolve(true)

  return new Promise((resolve) => {
    const token = req.cookies[SECURITY_COOKIE_NAME]
    if (!token) return resolve(false)

    const gReq = (GRAFANA_AUTH_PROTO === 'http' ? http : https).request({
      host: GRAFANA_AUTH_HOST,
      port: GRAFANA_AUTH_PORT,
      path: '/api/user',
      method: 'GET',
      headers: { Cookie: `${SECURITY_COOKIE_NAME}=${token}` },
      rejectUnauthorized: false, // loopback cert is issued for the public domain
      timeout: 3000,
    }, (gRes) => {
      gRes.resume() // drain the response
      resolve(gRes.statusCode === 200)
    })
    gReq.on('error', (err) => {
      console.error('Grafana auth validation failed:', err.message)
      resolve(false)
    })
    gReq.on('timeout', () => {
      gReq.destroy()
      console.error('Grafana auth validation timed out')
      resolve(false)
    })
    gReq.end()
  })
}

function saveFile(basePath, fileName, file, disableBackup = false) {
  if (fs.existsSync(`${basePath}/${fileName}`) && !disableBackup) {
    // file exists, create backup first, then save
    const timestamp = Date.now()
    fs.renameSync(`${basePath}/${fileName}`, `${basePath}/${fileName}.${timestamp}`)
    // save file
    fs.writeFileSync(`${basePath}/${fileName}`, file);
  } else {
    // file dosent exists, save file without backup
    fs.writeFileSync(`${basePath}/${fileName}`, file);
  }
}

function moveFile(originalPath, destinationPath, fileName) {
  console.log(`Moving file: "${fileName}" from "${originalPath}" to "${destinationPath}" `)
  if (!fs.existsSync(destinationPath)) {
    // Check if destination folder exits, if not create it
    fs.mkdirSync(destinationPath);
  }
  if (fs.existsSync(`${destinationPath}/${fileName}`)) {
    // file exists, create backup first, then move
    const timestamp = Date.now()
    fs.renameSync(`${destinationPath}/${fileName}`, `${destinationPath}/${fileName}.${timestamp}`)
    // move file
    fs.renameSync(`${originalPath}/${fileName}`, `${destinationPath}/${fileName}`)
  } else {
    // file dosent exists, move file without backup
    fs.renameSync(`${originalPath}/${fileName}`, `${destinationPath}/${fileName}`)
  }
}

// House convention: location names are lowercase with no special characters
// (so they map cleanly to docker container / vpn-script names). This was never
// enforced, so legacy names drifted (e.g. OPUS_AQUA, bartonw_lc). We normalise
// NEW names only — an existing name is left exactly as-is, because renaming a
// live site would orphan its InfluxDB data (tagged with the old name) and its
// VPN container/restart mapping.
function normaliseLocationName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function enforceNewLocationNames(configFile, existingPath) {
  const existingNames = new Set()
  try {
    const existing = yaml.load(fs.readFileSync(existingPath, 'utf8'))
    for (const k in (existing?.locations || {})) {
      const n = existing.locations[k]?.name
      if (n) existingNames.add(n)
    }
  } catch (err) {
    // first write or unreadable baseline: treat every name as new
  }
  for (const k in (configFile?.locations || {})) {
    const loc = configFile.locations[k]
    if (!loc?.name) continue
    if (existingNames.has(loc.name)) continue        // existing site: untouched
    const norm = normaliseLocationName(loc.name)
    if (norm && norm !== loc.name) {
      console.log(`Normalising new location name "${loc.name}" -> "${norm}"`)
      loc.name = norm
    }
  }
  return configFile
}

// An uploaded ETS project is never kept. Its group addresses are written out
// as <project>.xml, an ETS group-address export like every site's config, and
// any KNX Secure values wait in <project>.secure.json (mode 600) until save
const baseName = f => f.substring(0, f.lastIndexOf('.'))
const projectXmlName = f => baseName(f) + '.xml'
function pendingSecureFile(projectFileName) {
  return LOCATION_CONFIGURATION_FILES_LOCATION + baseName(projectFileName) + '.secure.json'
}

// a site given an uploaded project now uses the .xml written from it; returns
// the files to move into config/
function projectsToXml(configFile, toSave) {
  return toSave.map(f => {
    if (path.extname(f) !== '.knxproj' || !fs.existsSync(LOCATION_CONFIGURATION_FILES_LOCATION + projectXmlName(f))) return f
    for (const k in (configFile?.locations || {})) {
      const loc = configFile.locations[k]
      if (loc?.config === f) loc.config = projectXmlName(f)
    }
    return projectXmlName(f)
  })
}

// the stack a site runs on, as hamon works it out: the top-level stack: in
// hamon.yml, else the site's own stack:, else knx
function effectiveStack(loc, configFile) {
  return configFile?.stack || loc?.stack || 'knx'
}

// the secure entries to store, by location name, for the projects in this
// save, and the site's secure settings filled in where not set: stack
// knxultimate, secure true, tunnelIA the gateway's last tunnel. Returns
// { byName, pending, notes } or { error }
function pendingSecure(configFile, toSave) {
  const byName = {}
  const pending = []
  const notes = []
  for (const f of toSave) {
    if (path.extname(f) !== '.knxproj' || !fs.existsSync(pendingSecureFile(f))) continue
    pending.push(pendingSecureFile(f))
    const secure = JSON.parse(fs.readFileSync(pendingSecureFile(f), 'utf8'))
    for (const k in (configFile?.locations || {})) {
      const loc = configFile.locations[k]
      if (!loc?.name || loc.config !== projectXmlName(f)) continue
      const { entry, error, tunnelIA, defaulted } = secureEntryFor(secure, loc, loc.config)
      if (error) return { error }
      byName[loc.name] = entry
      if (!entry.gateway) continue   // Data Secure keys only, no secure gateway
      const set = []
      if (effectiveStack(loc, configFile) !== 'knxultimate') { loc.stack = 'knxultimate'; set.push('stack knxultimate') }
      if (loc.secure === undefined) { loc.secure = true; set.push('KNX Secure true') }
      if (defaulted) { loc.tunnelIA = tunnelIA; set.push(`tunnel ${tunnelIA} (the gateway's last - keep it free for hamon)`) }
      notes.push(`${loc.name}: KNX Secure values stored for gateway ${entry.gateway}` + (set.length ? `; set ${set.join(', ')}` : ''))
    }
  }
  return { byName, pending, notes }
}

app.post('/upload-configuration-file', async (req, res) => {
  if (!(await isAuthenticated(req))) {
    return res.status(401).json({ error: 'You are not logged in' })
  }
  let configurationFile
  const toSave = req?.body?.configurationsToSave || []
  let toMove = toSave
  let pending = []
  let secureNotes = []
  try {
    const configFile = enforceNewLocationNames(req?.body?.configFile,
      `${CONFIGURATION_FILE_LOCATION}/${CONFIGURATION_FILE_NAME}`)
    toMove = projectsToXml(configFile, toSave)
    // after the name check: secrets are stored under the final name
    const secure = pendingSecure(configFile, toSave)
    if (secure.error) return res.json({ success: false, msg: `Not saved: ${secure.error}` })
    pending = secure.pending
    secureNotes = secure.notes
    // after the secure defaults (which set the stack): secure needs knxultimate.
    // "default" in the form leaves no stack: line, so the site follows the
    // top-level stack: in hamon.yml - and with a top-level stack: set, every
    // site follows it: a site's own stack: line is dropped, so no site can be
    // put back on knx (one was on 2026-10-21, and its unsupported DPT crashed hamon)
    for (const k in (configFile?.locations || {})) {
      const loc = configFile.locations[k]
      if (loc && (loc.stack === '' || loc.stack == null || configFile.stack)) delete loc.stack
      if (loc?.secure === true && effectiveStack(loc, configFile) !== 'knxultimate') {
        return res.json({ success: false, msg: `Not saved: ${loc.name}: KNX Secure needs the knxultimate stack - set KNX stack to knxultimate, or KNX Secure to false` })
      }
    }
    extractSecrets(configFile, SECRETS_FILE, CONFIGURATION_FILE_LOCATION, secure.byName)
    configurationFile = yaml.dump(configFile)
  } catch (err) {
    console.error(err)
    // don't save hamon.yml without its passwords stored
    return res.json({ success: false, msg: `Not saved: ${err.message}` });
  }
  if (!configurationFile) {
    return res.json({ success: false, msg: "File was not found/Incorrect file" });
  }

  const destination = CONFIGURATION_FILE_LOCATION + LOCATION_CONFIGURATION_FILES_DESTINATION
  for (const configurationToSaveFileName of toMove) {
    try {
      if (fs.existsSync(LOCATION_CONFIGURATION_FILES_LOCATION + configurationToSaveFileName)) {
        moveFile(LOCATION_CONFIGURATION_FILES_LOCATION, destination, configurationToSaveFileName)
      }
    } catch (err) {
      console.error(`Moving location config files failed on ${configurationToSaveFileName}, skipping move this file`)
    }
  }

  saveFile(CONFIGURATION_FILE_LOCATION, CONFIGURATION_FILE_NAME, configurationFile)
  // stored (or not wanted by any site): the waiting secure values go
  for (const p of pending) fs.rmSync(p, { force: true })
  return res.json({ success: true, msg: ["File saved successfully", ...secureNotes].join('\n') });
});

app.post('/upload-location-configuration-file', async (req, res) => {
  if (!(await isAuthenticated(req))) {
    return res.status(401).json({ success: false, msg: 'You are not logged in' })
  }
  const file = req?.files?.configFile
  const configFilePassword = req.body.configFilePassword

  if (!file) {
    return res.json({ success: true, msg: "File was not found" });
  }

  saveFile(LOCATION_CONFIGURATION_FILES_LOCATION, file.name, file?.data, true)

  if (path.extname(file?.name) === '.knxproj') {
    // console.log('knx project file', LOCATION_CONFIGURATION_FILES_LOCATION)
    // TODO: add logic to parse knx project file

    const uploaded = `${LOCATION_CONFIGURATION_FILES_LOCATION}/${file.name}`
    await etsProjectParser(uploaded, configFilePassword)
      .then((project) => {
        // the project isn't kept: its GAs as an ETS export .xml, and for a
        // KNX Secure project the checked values, held until save
        fs.writeFileSync(LOCATION_CONFIGURATION_FILES_LOCATION + projectXmlName(file.name), project.gaExportXml)
        fs.rmSync(uploaded, { force: true })
        let notice
        if (project.secure) {
          writePrivateJson(pendingSecureFile(file.name), project.secure, CONFIGURATION_FILE_LOCATION)
          notice = describeSecure(project.secure)
          console.log(`${file.name}: KNX Secure project, secure values held for save`)
        }
        addr = 0;
        dpts = 0;
        ga = 0;
        const groupAddresses = project.groupAddresses
        for (let key in groupAddresses) {
          addr++;
          if (groupAddresses.hasOwnProperty(key)) {
            if (groupAddresses[key].dpt != undefined)
              dpts++;
            // console.log(key, groupAddresses[key].dpt,
            //     groupAddresses[key].name);
            ga++;
          }
        }
        console.log("%s has %d entries, %d with values and %d DPTs, written as %s (project file deleted)",
          file.name, addr, ga, dpts, projectXmlName(file.name));
        return res.json({ success: true, msg: "Location configuration file saved successfully", notice });
      }).catch(err => {
        // a project that couldn't be read isn't kept either
        fs.rmSync(uploaded, { force: true })
        if (err.message.startsWith('SECURE_VERIFY_FAILED')) {
          return res.json({ success: false, msg: `KNX Secure values in the project don't match their checks (${err.message.split(': ')[1]}) - not used` });
        } else if (err.message == 'BAD_PASSWORD') {
          return res.json({ success: false, msg: "Passed password is incorrect" });
        } else if (err.message == 'MISSING_PASSWORD') {
          return res.json({ success: false, msg: "This is secured knxproject file, password is required" });
        } else {
          return res.json({ success: false, msg: "Unknown error while parsing knx project file" });
        }
      })
  } else {
    return res.json({ success: true, msg: "Location configuration file saved successfully" });
  }

});

app.get('/load-configuration-file', async (req, res) => {
  if (!(await isAuthenticated(req))) {
    return res.status(401).json({ error: 'You are not logged in' })
  }
  let configFile
  try {
    configFile = yaml.load(fs.readFileSync(`${READ_CONFIGURATION_FILE_FROM || CONFIGURATION_FILE_LOCATION}/${CONFIGURATION_FILE_NAME}`, 'utf8'));
      
    let newConfig = {
        ...configFile,
        locations : {}
    }

     // map the fields
     // we are doing this to persist properties in order if field wasn't in file in first place
     for (locationKey in configFile.locations) {
         const tmp = Object.create(locationTemplate)
         const currentLocation = configFile.locations[locationKey]
         // copy location and add hapi if not defined
         tmp.name = currentLocation['name']
         tmp.desc = currentLocation['desc']
         tmp.enabled = currentLocation['enabled']
         tmp.hapi = !!currentLocation['hapi']
         tmp.dns = currentLocation['dns']
         tmp.port = currentLocation['port']
         tmp.device = currentLocation['device']
         tmp.phyAddr = currentLocation['phyAddr']
         tmp.logging = currentLocation['logging']
         tmp.config = currentLocation['config']
         // keep any other keys (stack, later the secure settings) - a save
         // writes back exactly what was loaded, so a key dropped here is lost
         for (const key of Object.keys(currentLocation)) {
           if (!Object.prototype.hasOwnProperty.call(tmp, key)) {
             tmp[key] = currentLocation[key]
           }
         }

         newConfig['locations'][locationKey] = tmp
     }
     configFile = maskSecrets(newConfig, SECRETS_FILE)
  } catch (err) {
    return res.json({ error: 'Configuration file not found' })
  }
  return res.json(configFile)
});

// DNS check for the status dots: amber = enabled but the dns entry does not
// resolve, so hamon cannot connect. Reads the on-disk hamon.yml
app.get('/dns-status', async (req, res) => {
  if (!(await isAuthenticated(req))) {
    return res.status(401).json({ error: 'You are not logged in' })
  }
  let configFile
  try {
    configFile = yaml.load(fs.readFileSync(`${READ_CONFIGURATION_FILE_FROM || CONFIGURATION_FILE_LOCATION}/${CONFIGURATION_FILE_NAME}`, 'utf8'));
  } catch (err) {
    return res.json({ error: 'Configuration file not found' })
  }
  return res.json(await dnsStatus(configFile.locations))
});

// hamon's own view of each site (connected / starting / down / misconfigured / blocked /
// disabled) for the status dots, from the state file ha-mon keeps beside
// hamon.yml. Read-only; { available: false } if ha-mon hasn't written one
app.get('/site-state', async (req, res) => {
  if (!(await isAuthenticated(req))) {
    return res.status(401).json({ error: 'You are not logged in' })
  }
  return res.json(siteState(`${READ_CONFIGURATION_FILE_FROM || CONFIGURATION_FILE_LOCATION}/tmp/site-state.json`))
});

// Re-check button on a blocked site: ha-mon re-checks it now (DNS, then
// whether its gateway answers) by way of tmp/kpipe
app.post('/recheck-site', async (req, res) => {
  if (!(await isAuthenticated(req))) {
    return res.status(401).json({ error: 'You are not logged in' })
  }
  const dir = READ_CONFIGURATION_FILE_FROM || CONFIGURATION_FILE_LOCATION
  let configFile
  try {
    configFile = yaml.load(fs.readFileSync(`${dir}/${CONFIGURATION_FILE_NAME}`, 'utf8'));
  } catch (err) {
    return res.json({ success: false, msg: 'Configuration file not found' })
  }
  return res.json(recheck(`${dir}/tmp/kpipe`, req?.body?.name, configFile.locations))
});

// Behind nginx (TLS=0) this serves plain http, and LISTEN_HOST=127.0.0.1 keeps
// it off the public interfaces; nginx terminates TLS and proxies /upload/ here
const TLS = NODE_ENV === 'production' && process.env.TLS !== '0'
const LISTEN_HOST = process.env.LISTEN_HOST   // unset = all interfaces

// check files and load cert and key
if (TLS && fs.existsSync(key_file)) { // production
  var key = fs.readFileSync(key_file);
  var cert = fs.readFileSync(cert_key);
}

var serverOptions = {
  key: key,
  cert: cert
};

let server
if(!TLS) {
  server = http.createServer({}, app);
} else {
  server = https.createServer(serverOptions, app);
}

server.listen(port, LISTEN_HOST, () => {
  console.log(`server starting on ${LISTEN_HOST || '*'}:${port} (${TLS ? 'https' : 'http'}) ...`)
});
//app.listen(port, () => console.log(`Listening on port ${port}...`));

// end of file
