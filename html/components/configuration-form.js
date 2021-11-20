'use strict';
import uploadFile from '../utils/upload-file.js';
import fieldsDefinition from '../utils/fields-definition.js';
import removeItemFromArray from '../utils/remove-item-from-array.js';

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
    this.state = { configFile: null, currentlyEdited: null, removableConfigs: [] };
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
      const response = window.confirm('Are you sure you want to override hamon.yml with new values? This change is inreversible')
      if (!response) {
        return
      }

      const configurationFile = jsyaml.dump(this?.state?.configFile)
      uploadFile(configurationFile, UPLOAD_CONFIGURATION_ENDPOINT)
      this.setState({ removableConfigs: [] })
    });
  }

  componentWillUnmount() {
    document.getElementById('configuration-edit-form').removeEventListener('submit')
  }

  render() {
    const content = []
    const configFile = this?.state?.configFile
    if (configFile) {
      content.push(e("div", { className: 'configuration-header-wrapper' },
        e("h3", { className: 'configuration-header-title' }, 'Locations:'),
        e("button", {
          type: "button",
          className: 'configuration-header-action-button',
          onClick: () => {
            const newLocationConfig = defaultLocationConfig
            const locationsLength = Object.keys(this?.state?.configFile?.locations)?.length
            let newConfigFile = Object.assign({}, this?.state?.configFile);
            const newLocationConfigKey = `Location-${locationsLength + 1}`
            const newRemovableConfigs = [...this?.state?.removableConfigs, newLocationConfigKey]
            newConfigFile.locations[newLocationConfigKey] = Object.assign({}, newLocationConfig);
            this.setState({ configFile: newConfigFile, currentlyEdited: newLocationConfigKey, removableConfigs: newRemovableConfigs })
          }
        }, 'Add Location'),
        e("button", { className: 'configuration-header-action-button', type: 'submit' }, 'Save Configuration')
      ))

      for (const [key, value] of Object.entries(configFile?.locations)) {
        const currentLocation = this?.state?.configFile.locations[key]
        const isLocationEnabled = currentLocation['enabled']
        const removableConfigs = this.state.removableConfigs

        content.push(e("div", { className: 'configuration-location-wrapper' },
          e("span", { className: `dot ${isLocationEnabled ? 'bg-green' : ''}` }),
          e("h4", { className: 'configuration-location-title', key: `${key}-header` }, value['name']),
          e("button", {
            type: "button",
            className: 'configuration-location-action-button',
            onClick: () => this.setState(prevState => ({ currentlyEdited: prevState?.currentlyEdited === key ? null : key }))
          }, 'Edit'),
          e("button", {
            type: "button",
            className: 'configuration-location-action-button',
            onClick: () => {
              currentLocation['enabled'] = !isLocationEnabled
              const newConfigFile = Object.assign({}, this?.state?.configFile);
              this.setState({ configFile: newConfigFile })
            }
          }, isLocationEnabled ? 'Disable' : 'Enable'),
          e("button", { className: 'configuration-location-action-button', type: 'submit' }, 'Save'),
          // allow removal of last location, but only if it was created recently
          removableConfigs.includes(key) && removableConfigs[removableConfigs.length - 1] === key && e("button", {
            type: "button",
            className: 'configuration-location-action-button',
            style: { color: 'crimson' },
            onClick: () => {
              delete this?.state?.configFile.locations[key]
              let newConfigFile = Object.assign({}, this?.state?.configFile);
              const newRemovableConfigs = removeItemFromArray(this?.state?.removableConfigs, key)
              this.setState({ configFile: newConfigFile, removableConfigs: [...newRemovableConfigs] })
            }
          }, 'Cancel'),
        ))

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

          content.push(e('div', { className: 'configuration-location-content-wrapper' },
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
                  uploadFile(file, UPLOAD_LOCATION_CONFIGURATION_ENDPOINT)
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

    return e(React.Fragment, null, content);
  }
}

const domContainer = document.querySelector('#configuration-edit-form');
ReactDOM.render(e(ConfigurationForm), domContainer);
