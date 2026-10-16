export const CONFIG_FILE_PASSWORD_KEY = 'configPass'

// the stack a site runs on, as hamon works it out: the site's own stack:,
// else the top-level stack: in hamon.yml, else knx
export const effectiveStack = (location, configFile) =>
  location?.stack || configFile?.stack || 'knx'

const fieldsDefinition = {
  'name': {
    label: 'Name:',
    type: 'text',
  },
  'desc': {
    label: 'Description:',
    type: 'text',
  },
  'enabled': {
    label: 'Enabled:',
    type: 'boolean',
  },
  'hapi': {
    label: 'HAPi (VPN):',
    type: 'boolean',
  },
  'dns': {
    label: 'DNS addr:',
    type: 'text',
  },
  'port': {
    label: 'Port addr:',
    type: 'text',
  },
  'device': {
    label: 'Device type:',
    type: 'select',
    values: ['generic', 'loxone', 'eibport']
  },
  'phyAddr': {
    label: 'Physical addr:',
    type: 'text',
  },
  // "default" (no stack: line) follows the top-level `stack:` in hamon.yml,
  // else knx. Pick knx or knxultimate only to hold one site on a stack
  'stack': {
    label: 'KNX stack:',
    type: 'select',
    values: ['', 'knx', 'knxultimate'],
    labels: { '': 'default' },
    default: '',
  },
  // KNX Secure tunnelling (needs stack knxultimate). The secure values come
  // from the site's ETS project when it's uploaded and live in the secret
  // store, never in hamon.yml. Absent means false (plain), as for every site
  // today; uploading a secure project sets it to true
  'secure': {
    label: 'KNX Secure:',
    type: 'boolean',
    requires: { stack: 'knxultimate' },
  },
  // the gateway tunnel hamon uses, e.g. 1.1.9; uploading a secure project sets
  // it to the gateway's last tunnel, which the integrator keeps free for hamon
  'tunnelIA': {
    label: 'Tunnel IA:',
    type: 'text',
    requires: { stack: 'knxultimate' },
  },
  'logging': {
    label: 'Logging:',
    type: 'select',
    values: ['error', 'warn', 'info', 'debug']
  },
  'config': {
    label: 'Configuration:',
    type: 'file',
  },
  [CONFIG_FILE_PASSWORD_KEY]: {
    type: 'password',
    label: 'Config pass:',
  },
}

export default fieldsDefinition
