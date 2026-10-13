export const CONFIG_FILE_PASSWORD_KEY = 'configPass'

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
  // absent means knx. Filled in when a site is edited, so stack: reaches
  // hamon.yml site by site as sites are updated - not all at once, because
  // hamon restarts a site's worker whenever one of its keys changes
  'stack': {
    label: 'KNX stack:',
    type: 'select',
    values: ['knx', 'knxultimate'],
    default: 'knx',
    fillOnEdit: true,
  },
  // KNX Secure tunnelling (needs stack knxultimate). The secure values come
  // from the site's ETS project when it's uploaded and live in the secret
  // store, never in hamon.yml. Absent means plain, as for every site today
  'secure': {
    label: 'Secure:',
    type: 'select',
    values: ['off', 'tunnel'],
    default: 'off',
  },
  // the gateway tunnel reserved for hamon, e.g. 1.1.250 (one of those listed
  // when the secure project was uploaded)
  'tunnelIA': {
    label: 'Tunnel IA:',
    type: 'text',
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
