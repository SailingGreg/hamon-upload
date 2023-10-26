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
  'logging': {
    label: 'Logging:',
    type: 'text',
  },
  'config': {
    label: 'Configuration:',
    type: 'file',
  },
  [CONFIG_FILE_PASSWORD_KEY]: {
    type: 'password',
  },
}

export default fieldsDefinition
