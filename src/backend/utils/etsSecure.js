/*
 * etsSecure.js - the KNX Secure material hamon needs, from an ETS project
 *
 * ETS keeps the security material in the project itself (a .knxkeys keyring
 * is only an export of it). Once the password-protected project is open, the
 * values are plain attributes in 0.xml. hamon needs only:
 *   - each secure IP interface's device authentication code
 *   - its tunnel interfaces: individual address, user ID and password
 *   - the group keys of Data Secure group addresses
 * Tool keys, management passwords and backbone keys are deliberately not read.
 *
 * Every code and password is checked against the PBKDF2 hash ETS stores beside
 * it (the same derivation the KNX Secure handshake uses), so a bad extraction
 * fails at upload rather than when hamon connects. Values are never logged.
 */

const crypto = require('crypto')
const { formatGroupAddress } = require('./formatGa.js')

const SALT_PASSWORD = 'user-password.1.secure.ip.knx.org'
const SALT_DEVICE_CODE = 'device-authentication-code.1.secure.ip.knx.org'

function knxHash(value, salt) {
  return crypto.pbkdf2Sync(Buffer.from(value, 'latin1'), salt, 65536, 16, 'sha256').toString('base64')
}

// an attribute and its stored hash: true if they agree, or if ETS stored no hash
function verified(value, hash, salt) {
  return !hash || knxHash(value, salt) === hash
}

// 0.xml -> { gateways, groupKeys, busInterfaceRefs }, before tunnel addresses
// are resolved. parseXml(buffer, onOpenTag, onCloseTag) is the parser's helper.
async function collect(projectXml, parseXml) {
  const gateways = []
  const groupKeys = {}
  let area, line, device, inAdditional = false

  await parseXml(projectXml, el => {
    const a = el.attributes
    switch (el.name) {
      case 'Area': area = a.Address; break
      case 'Line': line = a.Address; break
      case 'DeviceInstance':
        device = { address: a.Address, name: a.Name || '', product: a.ProductRefId || '', additional: [], busInterfaces: [] }
        break
      case 'AdditionalAddresses': inAdditional = !!device; break
      case 'Address': if (inAdditional) device.additional.push(a.Address); break
      case 'IPConfig': if (device) device.lanIp = a.IPAddress; break
      case 'Security':
        if (device && a.DeviceAuthenticationCode) {
          device.code = a.DeviceAuthenticationCode
          device.codeHash = a.DeviceAuthenticationCodeHash
        }
        break
      case 'BusInterface':
        if (device && a.Password) device.busInterfaces.push({ refId: a.RefId, password: a.Password, hash: a.PasswordHash })
        break
      case 'GroupAddress':
        if (a.Key) groupKeys[formatGroupAddress(parseInt(a.Address))] = a.Key
        break
    }
  }, name => {
    if (name === 'AdditionalAddresses') inAdditional = false
    if (name === 'DeviceInstance' && device) {
      if (device.code && device.busInterfaces.length > 0) {
        gateways.push({ ...device, ia: `${area}.${line}.${device.address}` })
      }
      device = undefined
    }
  })
  return { gateways, groupKeys }
}

// the manufacturer application file that defines a BusInterface RefId:
// M-00C5_A-0716-10-9DDB_BI-1 -> M-00C5/M-00C5_A-0716-10-9DDB.xml
function applicationFileFor(refId) {
  const app = refId.replace(/_BI-[^_]+$/, '')
  return `${app.split('_')[0]}/${app}.xml`
}

// RefId -> AddressIndex, from the manufacturer application files
async function addressIndexes(refIds, readArchiveEntries, parseXml) {
  const files = [...new Set(refIds.map(applicationFileFor))]
  const buffers = await readArchiveEntries(files)
  const index = {}
  for (const buffer of Object.values(buffers)) {
    await parseXml(buffer, el => {
      if (el.name === 'BusInterface' && refIds.includes(el.attributes.Id)) {
        index[el.attributes.Id] = parseInt(el.attributes.AddressIndex)
      }
    })
  }
  return index
}

/*
 * The secure material in a project, or null if it has none:
 *   { gateways: [ { ia, name, lanIp, deviceAuthCode,
 *                   tunnels: { '<ia>': { userId, password } } } ],
 *     groupKeys: { '<ga>': '<base64 key>' } }
 * Throws SECURE_VERIFY_FAILED if a code or password doesn't match its hash.
 */
async function extractSecure(projectXml, readArchiveEntries, parseXml) {
  const { gateways, groupKeys } = await collect(projectXml, parseXml)
  if (gateways.length === 0 && Object.keys(groupKeys).length === 0) return null

  const refIds = gateways.flatMap(g => g.busInterfaces.map(b => b.refId))
  const index = refIds.length ? await addressIndexes(refIds, readArchiveEntries, parseXml) : {}

  const result = { gateways: [], groupKeys }
  for (const g of gateways) {
    if (!verified(g.code, g.codeHash, SALT_DEVICE_CODE)) {
      throw new Error(`SECURE_VERIFY_FAILED: device authentication code of ${g.ia}`)
    }
    const [area, line] = g.ia.split('.')
    const tunnels = {}
    for (const b of g.busInterfaces) {
      const n = index[b.refId]
      // AddressIndex n is the n-th additional address; secure tunnelling user
      // IDs start at 2 (user 1 is the management user)
      const address = n && g.additional[n - 1]
      if (!address) {
        console.warn(`KNX Secure: no tunnel address for ${b.refId} on ${g.ia}, skipped`)
        continue
      }
      if (!verified(b.password, b.hash, SALT_PASSWORD)) {
        throw new Error(`SECURE_VERIFY_FAILED: tunnel password for ${area}.${line}.${address}`)
      }
      tunnels[`${area}.${line}.${address}`] = { userId: n + 1, password: b.password }
    }
    result.gateways.push({ ia: g.ia, name: g.name, lanIp: g.lanIp, deviceAuthCode: g.code, tunnels })
  }
  return result
}

// individual addresses in numeric order (x.y.2 before x.y.10)
const iaOrder = ia => ia.split('.').reduce((n, part) => n * 256 + Number(part), 0)

// hamon's rule: it uses the gateway's LAST tunnel, so the integrator keeps
// that one free (ETS and visualisations take the first free tunnel)
function lastTunnel(gateway) {
  return Object.keys(gateway.tunnels).sort((a, b) => iaOrder(a) - iaOrder(b)).pop()
}

const tunnelList = g => `${Object.keys(g.tunnels).sort((a, b) => iaOrder(a) - iaOrder(b)).join(', ')} (gateway ${g.ia})`

// what was found, without any secret, for the person uploading
function describeSecure(secure) {
  const parts = secure.gateways.map(g => {
    const t = Object.keys(g.tunnels)
    return `gateway ${g.ia}${g.lanIp ? ` (${g.lanIp})` : ''} with ${t.length} tunnel${t.length === 1 ? '' : 's'}${t.length ? `: ${tunnelList(g).replace(/ \(gateway.*$/, '')}` : ''}`
  })
  const keys = Object.keys(secure.groupKeys).length
  if (keys) parts.push(`${keys} Data Secure group address${keys === 1 ? '' : 'es'}`)
  let next = ''
  if (secure.gateways.length === 1 && lastTunnel(secure.gateways[0])) {
    next = `When you save, the site is set to KNX Secure on the knxultimate stack, using the gateway's ` +
      `last tunnel ${lastTunnel(secure.gateways[0])}: keep that tunnel free for hamon (set "Tunnel IA" to use another).`
  } else if (secure.gateways.length > 1) {
    next = 'Set "Tunnel IA" to the tunnel reserved for hamon before saving.'
  }
  return `KNX Secure project: ${parts.join('; ')}. ` +
    'The secure values were checked and will be stored when you save; the project file itself is not kept. ' + next
}

// the gateway and tunnel a site uses: its tunnelIA if set, else the only
// secure gateway's last tunnel. { gateway, tunnelIA, defaulted } or { error };
// {} if the project has no secure gateway (Data Secure keys only)
function pickTunnel(secure, loc, configFile) {
  if (loc.tunnelIA) {
    const gateway = secure.gateways.find(g => g.tunnels[loc.tunnelIA])
    if (!gateway) {
      return { error: `${loc.name}: tunnel ${loc.tunnelIA} isn't a tunnel of a secure gateway in ${configFile} - ` +
        `use one of ${secure.gateways.map(tunnelList).join('; ')}` }
    }
    return { gateway, tunnelIA: loc.tunnelIA, defaulted: false }
  }
  if (secure.gateways.length === 1) {
    const tunnelIA = lastTunnel(secure.gateways[0])
    if (!tunnelIA) return { error: `${loc.name}: gateway ${secure.gateways[0].ia} in ${configFile} has no secure tunnels` }
    return { gateway: secure.gateways[0], tunnelIA, defaulted: true }
  }
  if (secure.gateways.length > 1) {
    return { error: `${loc.name}: ${configFile} has ${secure.gateways.length} secure gateways - set "Tunnel IA" to one of ` +
      secure.gateways.map(tunnelList).join('; ') }
  }
  return {}
}

// the stored entry for one site: its gateway's code and tunnels and the
// project's group keys. { entry, tunnelIA, defaulted } or { error }
function secureEntryFor(secure, loc, configFile) {
  const pick = pickTunnel(secure, loc, configFile)
  if (pick.error) return pick
  const entry = { configFile, stored: new Date().toISOString(), groupKeys: secure.groupKeys }
  if (pick.gateway) {
    Object.assign(entry, { gateway: pick.gateway.ia, deviceAuthCode: pick.gateway.deviceAuthCode, tunnels: pick.gateway.tunnels })
  }
  return { entry, tunnelIA: pick.tunnelIA, defaulted: pick.defaulted }
}

module.exports = { extractSecure, describeSecure, secureEntryFor, lastTunnel, knxHash }
