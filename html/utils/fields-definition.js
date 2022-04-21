export const CONFIG_FILE_PASSWORD_KEY = 'configPass'

const fieldsDefinition = {
  'name': {
    type: 'text',
  },
  'desc': {
    type: 'text',
  },
  'enabled': {
    type: 'text',
  },
  'dns': {
    type: 'text',
  },
  'port': {
    type: 'text',
  },
  'device': {
    type: 'text',
  },
  'phyAddr': {
    type: 'text',
  },
  'logging': {
    type: 'text',
  },
  'config': {
    type: 'file',
  },
  [CONFIG_FILE_PASSWORD_KEY]: {
    type: 'text',
  },
}

export default fieldsDefinition
