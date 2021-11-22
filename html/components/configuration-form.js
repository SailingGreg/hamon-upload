'use strict';
import uploadFile from '../utils/upload-file.js';
import fieldsDefinition from '../utils/fields-definition.js';

const e = React.createElement;

const UPLOAD_CONFIGURATION_ENDPOINT = '/upload-configuration-file';
const UPLOAD_LOCATION_CONFIGURATION_ENDPOINT = '/upload-location-configuration-file';

const defaultLocationConfig = {
  'name': 'new-location',
  'desc': '',
  'enabled': true,
  'dns': '',
  'port': '3671',
  'device': 'generic',
  'phyAddr': '15.15.15',
  'logging': 'info',
  'config': '',
}

class ConfigurationForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = { configFile: null, currentlyEdited: null, newLocationId: false };
  }

  componentDidMount() {
    fetch('/load-configuration-file')
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          window.alert(data.error)
          return
        }
        this.setState({ configFile: data })
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 100);
      });

    document.getElementById('configuration-edit-form').addEventListener('submit', (e) => {
      e.preventDefault()
      const response = window.confirm('Update the configuration and location file?')
      if (!response) {
        return
      }

      const configurationFile = jsyaml.dump(this?.state?.configFile)
      uploadFile(configurationFile, UPLOAD_CONFIGURATION_ENDPOINT)
      this.setState({ newLocationId: false })
    });
  }

  componentWillUnmount() {
    document.getElementById('configuration-edit-form').removeEventListener('submit')
  }

  render() {
    const tableHeader = []
    const table = []
    const configFile = this?.state?.configFile
    const newLocationId = this?.state?.newLocationId
    if (configFile) {
      tableHeader.push(e("div", { className: 'configuration-header-wrapper' },
        e("h3", { className: 'configuration-header-title' }, 'Locations:'),
        e("span", { className: 'configuration-header-title' },
          e("button", {
            type: "button",
            disabled: newLocationId,
            className: 'configuration-header-action-button',
            onClick: () => {
              const newLocationConfig = defaultLocationConfig
              const locationsLength = Object.keys(this?.state?.configFile?.locations)?.length
              let newConfigFile = Object.assign({}, this?.state?.configFile);
              const newLocationConfigKey = `Location-${locationsLength + 1}`
              newConfigFile.locations[newLocationConfigKey] = Object.assign({}, newLocationConfig);
              this.setState({ configFile: newConfigFile, currentlyEdited: newLocationConfigKey, newLocationId: newLocationConfigKey })
            }
          }, 'Add Location'),
          e("button", { className: 'configuration-header-action-button', type: 'submit' }, 'Save Configuration')
        )
      ))

      // display the locations?
      for (const [key, value] of Object.entries(configFile?.locations)) {
        const currentLocation = this?.state?.configFile.locations[key]
        const isLocationEnabled = currentLocation['enabled']
        const isCurrentlyEdited = this.state?.currentlyEdited === key
        const editableContent = []
        table.push(e("tr", { className: 'configuration-location-wrapper' },
          e("th", { style: { width: 25 } }, e("span", { className: `dot ${isLocationEnabled ? 'bg-green' : ''}` })),
          e("th", { style: { textAlign: 'left' } }, e("h4", { className: 'configuration-location-title', key: `${key}-header` }, value['name'])),
          e("th", null,
            e("button", {
              type: "button",
              style: { minWidth: 75 },
              className: 'configuration-location-action-button',
              onClick: () => {
                this.setState(prevState => ({ currentlyEdited: prevState?.currentlyEdited === key ? null : key }))
                if (newLocationId) {
                  delete this?.state?.configFile.locations[newLocationId]
                  let newConfigFile = Object.assign({}, this?.state?.configFile);
                  this.setState({ configFile: newConfigFile, newLocationId: false })
                }
              }
            }, isCurrentlyEdited ? 'Cancel' : 'Edit'),
            e("button", {
              type: "button",
              className: 'configuration-location-action-button',
              onClick: () => {
                currentLocation['enabled'] = !isLocationEnabled
                const newConfigFile = Object.assign({}, this?.state?.configFile);
                this.setState({ configFile: newConfigFile })
              }
            }, isLocationEnabled ? 'Disable' : 'Enable'),
            e("button", {
              type: "button", className: 'configuration-location-action-button',
              onClick: () => {
                this.setState({ currentlyEdited: null, newLocationId: null })
              }
            }, 'Update')
          ),
        ))
        table.push(e('td', { colspan: 5 }, editableContent))

        for (const [keyLocation, valueLocation] of Object.entries(value)) {
          if (this?.state?.currentlyEdited !== key) {
            // THIS LOCATION IS NOT CURRENTLY EDITED, DONT SHOW FIELDS
            continue
          }
          const fieldDefinition = fieldsDefinition[keyLocation]
          if (!fieldDefinition) {
            console.error('NO FIELD DEF')
            continue
          }
          if (fieldDefinition.hidden) {
            // THIS FIELD IS HIDDEN, DONT SHOW
            continue
          }

          editableContent.push(e('div', { className: 'configuration-location-content-wrapper' },
            e("label", {
              className: 'configuration-location-content-label',
              key: `${key}-${keyLocation}-label`,
              htmlFor: `${key}-${keyLocation}`
            }, keyLocation),
            e("input", {
              id: `${key}-${keyLocation}`,
              key: `${key}-${keyLocation}`,
              value: valueLocation,
              readOnly: fieldDefinition?.readOnly ? '' : null,
              onChange: (e) => {
                this.setState(prevState => {
                  let newConfigFile = Object.assign({}, prevState.configFile);
                  newConfigFile.locations[key][keyLocation] = e?.target?.value
                  return { config: newConfigFile };
                })
              }
            }),
            fieldDefinition.type === 'file' && e("input", {
              id: `${key}-${keyLocation}-file-upload`,
              key: `${key}-${keyLocation}-file-upload`,
              type: 'file',
              onChange: (e) => {
                const file = e?.target?.files[0]
                if (file) {
                  uploadFile(file, UPLOAD_LOCATION_CONFIGURATION_ENDPOINT, true)
                  this.setState(prevState => {
                    let newConfigFile = Object.assign({}, prevState.configFile);
                    newConfigFile.locations[key][keyLocation] = file?.name
                    return { config: newConfigFile };
                  })
                }
              }
            }),
          ))
        }
      }
    }

    return e('div', { style: { maxWidth: 512 } }, [e('div', null, tableHeader), e('table', { style: { width: '100%' } }, table)])
  }
}

const domContainer = document.querySelector('#configuration-edit-form');
ReactDOM.render(e(ConfigurationForm), domContainer);
