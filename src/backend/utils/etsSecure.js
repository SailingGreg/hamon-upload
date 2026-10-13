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

// what was found, without any secret, for the person uploading
function describeSecure(secure) {
  const parts = secure.gateways.map(g => {
    const t = Object.keys(g.tunnels)
    return `gateway ${g.ia}${g.lanIp ? ` (${g.lanIp})` : ''} with ${t.length} tunnel${t.length === 1 ? '' : 's'}${t.length ? `: ${t.join(', ')}` : ''}`
  })
  const keys = Object.keys(secure.groupKeys).length
  if (keys) parts.push(`${keys} Data Secure group address${keys === 1 ? '' : 'es'}`)
  return `KNX Secure project: ${parts.join('; ')}. ` +
    'The secure values were checked and will be stored when you save; the project file itself is not kept. ' +
    'Set "Secure" to tunnel and "Tunnel IA" to the tunnel reserved for hamon.'
}

// the stored entry for one site: the gateway its tunnelIA belongs to (or the
// only one), its tunnels and the project's group keys. Returns { entry } or
// { error }.
function secureEntryFor(secure, loc, configFile) {
  let gateway
  if (loc.tunnelIA) {
    gateway = secure.gateways.find(g => g.tunnels[loc.tunnelIA])
    if (!gateway) return { error: `${loc.name}: tunnel ${loc.tunnelIA} isn't a tunnel of a secure gateway in ${configFile}` }
  } else if (secure.gateways.length === 1) {
    gateway = secure.gateways[0]
  } else if (secure.gateways.length > 1) {
    return { error: `${loc.name}: ${configFile} has ${secure.gateways.length} secure gateways - set "Tunnel IA" to pick one` }
  }
  const entry = { configFile, stored: new Date().toISOString(), groupKeys: secure.groupKeys }
  if (gateway) Object.assign(entry, { gateway: gateway.ia, deviceAuthCode: gateway.deviceAuthCode, tunnels: gateway.tunnels })
  return { entry }
}

module.exports = { extractSecure, describeSecure, secureEntryFor, knxHash }
