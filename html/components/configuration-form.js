'use strict';
import uploadFile from '../utils/upload-file.js';
import fieldsDefinition, { CONFIG_FILE_PASSWORD_KEY } from '../utils/fields-definition.js';

const e = React.createElement;

const UPLOAD_CONFIGURATION_ENDPOINT = '/upload-configuration-file';
const UPLOAD_LOCATION_CONFIGURATION_ENDPOINT = '/upload-location-configuration-file';

const defaultLocationConfig = {
  'name': 'new-location',
  'desc': '',
  'enabled': true,
  'hapi': false,
  'dns': '',
  'port': 3671,
  'device': 'generic',
  'phyAddr': '15.15.15',
  'logging': 'info',
  'config': '',
}

class ConfigurationForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = { configFile: null, currentlyEdited: null, currentlyEditedLocationBackup: null, newLocationId: false, configurationsToSave: [], searchTerm: null, configFileUpload: false };
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

      fetch(UPLOAD_CONFIGURATION_ENDPOINT, {
        body: JSON.stringify({
          configurationsToSave: this?.state?.configurationsToSave,
          configFile: this?.state?.configFile
        }),
        method: "post",
        headers: {
          'Content-Type': 'application/json'
        },
      })
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            window.alert(data.error)
            return
          }
          if (data.msg) {
            window.alert(data.msg)
          }
          this.setState({ currentlyEdited: null, newLocationId: null, configurationsToSave: [] })
        });
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
    const searchTerm = this?.state?.searchTerm
    const configFileUpload = this?.state?.configFileUpload
    if (configFile) {
      tableHeader.push(e("div", { className: 'configuration-header-wrapper' },
        e("h3", { className: 'configuration-header-title' }, 'Locations:'),
        e("input", {
          value: searchTerm, placeholder: 'Search..', className: 'configuration-header-title',
          onChange: (e) => this.setState({ searchTerm: e?.target?.value })
        }),
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
          e("button", { disabled: configFileUpload, className: 'configuration-header-action-button', type: 'submit' }, 'Save Configuration')
        )
      ))

      // display the locations?
      for (const [key, value] of Object.entries(configFile?.locations)) {
        const currentLocation = this?.state?.configFile.locations[key]
        const isLocationEnabled = currentLocation['enabled']
        const isCurrentlyEdited = this.state?.currentlyEdited === key
        const editableContent = []
        if (searchTerm && !((currentLocation?.name || '').includes(searchTerm))) {
          // this record dosent meet requirements of search input, skip
          continue
        }

        table.push(e("tr", { className: 'configuration-location-wrapper' },
          e("th", { style: { width: 25 } }, e("span", { className: `dot ${isLocationEnabled ? 'bg-green' : ''}` })),
          e("th", { style: { textAlign: 'left' } }, e("h4", { className: 'configuration-location-title', key: `${key}-header` }, value['name'])),
          e("th", null,
            e("button", {
              type: "button",
              style: { minWidth: 75 },
              className: 'configuration-location-action-button',
              onClick: () => {
                if (isCurrentlyEdited) {
                  //PRESSED CANCEL, REVERTING CHANGES
                  const configFile = this?.state?.configFile
                  configFile.locations[key] = this?.state?.currentlyEditedLocationBackup
                  let restoredConfigFile = Object.assign({}, configFile)
                  this.setState(prevState => ({ currentlyEdited: prevState?.currentlyEdited === key ? null : key, configFile: restoredConfigFile, currentlyEditedLocationBackup: null }))
                } else {
                  const currentLocationData = Object.assign({}, this?.state?.configFile.locations[key])
                  this.setState(prevState => ({ currentlyEdited: prevState?.currentlyEdited === key ? null : key, currentlyEditedLocationBackup: currentLocationData }))
                }
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
        for (const [fieldDefinitionKey, fieldDefinition] of Object.entries(fieldsDefinition)) {
          const fieldValue = value[fieldDefinitionKey]
          if (this?.state?.currentlyEdited !== key) {
            // THIS LOCATION IS NOT CURRENTLY EDITED, DONT SHOW FIELDS
            continue
          }
          if (fieldDefinition.hidden) {
            // THIS FIELD IS HIDDEN, DONT SHOW
            continue
          }

          editableContent.push(e('div', { className: 'configuration-location-content-wrapper' },
            e("label", {
              className: 'configuration-location-content-label',
              key: `${key}-${fieldDefinitionKey}-label`,
              htmlFor: `${key}-${fieldDefinitionKey}`
            }, fieldDefinition.label || fieldDefinitionKey),
            fieldDefinition.type === 'boolean' ? e("select", {
              id: `${key}-${fieldDefinitionKey}`,
              key: `${key}-${fieldDefinitionKey}`,
              value: typeof fieldValue == "boolean" ? fieldValue : fieldValue === "true",
              readOnly: fieldDefinition?.readOnly ? '' : null,
              onChange: (e) => {
                this.setState(prevState => {
                  let newConfigFile = Object.assign({}, prevState.configFile);
                  let value = e?.target?.value

                  if(typeof value === "string") {
                    value = value === "true"
                  }

                  newConfigFile.locations[key][fieldDefinitionKey] = value
                  return { config: newConfigFile };
                })
              }
            }, [
                e("option", { value: true }, 'true'),
                e("option", { value: false }, 'false'),
            ]) :
            fieldDefinition.type === 'select' ? e("select", {
              id: `${key}-${fieldDefinitionKey}`,
              key: `${key}-${fieldDefinitionKey}`,
              value: fieldValue,
              readOnly: fieldDefinition?.readOnly ? '' : null,
              onChange: (e) => {
                this.setState(prevState => {
                  let newConfigFile = Object.assign({}, prevState.configFile);
                  newConfigFile.locations[key][fieldDefinitionKey] = e?.target?.value
                  return { config: newConfigFile };
                })
              }
            }, [
              fieldDefinition.values.map(value => (
                e("option", { value }, value)
              ))
            ]) :
              e("input", {
                id: `${key}-${fieldDefinitionKey}`,
                key: `${key}-${fieldDefinitionKey}`,
                value: fieldValue,
                type: fieldDefinition.type === 'password' ? 'password' : null,
                readOnly: fieldDefinition?.readOnly ? '' : null,
                onChange: (e) => {
                  this.setState(prevState => {
                    let newConfigFile = Object.assign({}, prevState.configFile);
                    newConfigFile.locations[key][fieldDefinitionKey] = e?.target?.value
                    return { config: newConfigFile };
                  })
                }
              })
            ,
            fieldDefinition.type === 'file' && e("input", {
              id: `${key}-${fieldDefinitionKey}-file-upload`,
              key: `${key}-${fieldDefinitionKey}-file-upload`,
              type: 'file',
              accept: '.xml,.knxproj',
              disabled: this.state.configFileUpload,
              onChange: async (e) => {
                const file = e?.target?.files[0]
                const fileNameRegex = /\s|\(|\)/g
                if (file && !fileNameRegex.test(file?.name)) {
                  let configFilePassword
                  if (file?.type === 'text/xml') {
                    // HANDLE XML CONFIG
                    this.setState({ configFileUpload: true })
                    const uploadSuccess = await uploadFile(file, UPLOAD_LOCATION_CONFIGURATION_ENDPOINT, true)
                    if (!uploadSuccess) {
                      // upload failed, do not continue
                      this.setState({ configFileUpload: false })
                      return
                    }
                  } else {
                    // HANDLE KNXPROJECT CONFIG
                    configFilePassword = prompt("Enter config password (Leave empty is config is not secured)")
                    if (configFilePassword == null) {
                      e.target.value = null
                      return false
                    }
                    this.setState({ configFileUpload: true })
                    const uploadSuccess = await uploadFile(file, UPLOAD_LOCATION_CONFIGURATION_ENDPOINT, true, configFilePassword)
                    if (!uploadSuccess) {
                      // upload failed, do not continue
                      e.target.value = null
                      this.setState({ configFileUpload: false })
                      return false
                    }
                  }
                  this.setState(prevState => {
                    let newConfigFile = Object.assign({}, prevState.configFile);
                    newConfigFile.locations[key][fieldDefinitionKey] = file?.name
                    if (configFilePassword) {
                      newConfigFile.locations[key][CONFIG_FILE_PASSWORD_KEY] = configFilePassword
                    }
                    return { config: newConfigFile, configFileUpload: false, configurationsToSave: [...prevState?.configurationsToSave, file?.name] };
                  })
                } else {
                  alert('Incorrect file or file has incorrect name (No spaces or parentheses)')
                  e.target.value = null
                }
              }
            }),
          ))
        }

        if (editableContent.length > 0) {
          table.push(e('td', { colspan: 5 }, editableContent))
        }
      }
    }

    return e('div', { style: { maxWidth: 620 } }, [
      !!configFileUpload && e('div', { style: { position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, .5)' } }, [
        e('div', { style: { border: '2px solid white', padding: 12, backgroundColor: 'rgba(0, 0, 0, .9)' } }, [
          e('p', { border: '2px solid white' }, 'Please wait, uploading and parsing file…')
        ])
      ]),
      e('div', null, tableHeader),
      e('table', { style: { width: '100%' } }, table)
    ])
  }
}

const domContainer = document.querySelector('#configuration-edit-form');
ReactDOM.render(e(ConfigurationForm), domContainer);
