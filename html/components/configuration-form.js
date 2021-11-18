'use strict';

const e = React.createElement;

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
}

const defaultLocation = {
  'name': 'new-location',
  'desc': '',
  'enabled': true,
  'dns': '',
  'port': '',
  'device': '',
  'phyAddr': '',
  'logging': '',
  'config': '',
}

function uploadFile(data) {
  // define data and connections
  var blob = new Blob([data]);
  var url = URL.createObjectURL(blob);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/upload-file', true);
  // xhr.setRequestHeader("Content-Type", "application/x-yaml");
  // define new form
  var formData = new FormData();
  formData.append('configFile', blob, 'hamon.yml');

  // action after uploading happens
  xhr.onload = function (e) {
    console.log("File uploading completed!");
  };

  // do the uploading
  console.log("File uploading started!");
  xhr.send(formData);
}

class ConfigurationForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = { configFile: null, currentlyEdited: null };
  }

  componentDidMount() {
    fetch('/load-configuration-file')
      .then(response => response.json())
      .then(data => {
        this.setState({ configFile: data })
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 100);
      });

    document.getElementById('configuration-browse-form').addEventListener('submit', (e) => {
      e.preventDefault()
      const files = e?.target?.elements[0].files
      files[0].text().then(result => {
        const configurationFileParsed = jsyaml.load(result)
        console.log('configurationFileParsed', configurationFileParsed)
        this.setState({ configFile: configurationFileParsed })
      })
    });
    document.getElementById('configuration-edit-form').addEventListener('submit', (e) => {
      e.preventDefault()
      const response = window.confirm('Are you sure you want to override hamon.yml with new values? This change is inreversible')
      if(!response) {
        return
      }

      const configurationFile = jsyaml.dump(this?.state?.configFile)
      const configurationUploadForm = document.getElementById('configuration-upload-form');

      uploadFile(configurationFile)

      // fetch("/upload-file", {
      //   method: "POST",
      //   headers: { 'Content-Type': 'multipart/form-data' },
      //   body: {
      //     file: JSON.stringify(configurationFile)
      //   }
      // }).then(res => {
      //   console.log("Request complete! response:", res);
      // });
    });
  }

  componentWillUnmount() {
    document.getElementById('configuration-browse-form').removeEventListener('submit')
    document.getElementById('configuration-edit-form').removeEventListener('submit')
  }

  render() {
    const content = []
    const configFile = this?.state?.configFile
    if (configFile) {
      content.push(e(React.Fragment, null,
        /*#__PURE__*/
        e("h3", { style: { marginRight: 8, display: 'inline' } }, 'Locations:')
      ))
      content.push(e("button", {
        type: "button",
        onClick: () => {
          const newLocation = defaultLocation
          const locationsLength = Object.keys(this?.state?.configFile?.locations)?.length
          let newConfigFile = Object.assign({}, this?.state?.configFile);
          const newLocationKey = `Location-${locationsLength + 1}`
          newConfigFile.locations[newLocationKey] = Object.assign({}, newLocation);
          this.setState({ configFile: newConfigFile, currentlyEdited: newLocationKey })
        }
      }, 'Add Location'))
      content.push(e("br", {}), e("br", {}))
      for (const [key, value] of Object.entries(configFile?.locations)) {
        const currentLocation = this?.state?.configFile.locations[key]
        const isLocationEnabled = currentLocation['enabled'] 
        content.push(e("span", { className: `dot ${isLocationEnabled? 'bg-green': ''}` }))
        content.push(e(React.Fragment, null,
          /*#__PURE__*/
          e("h4", { style: { display: 'inline', marginRight: 8 }, key: `${key}-header` }, value['name'])
        ))
        content.push(e("button", {
          type: "button",
          style: { marginRight: 8 },
          onClick: () => this.setState(prevState => ({ currentlyEdited: prevState?.currentlyEdited === key ? null : key }))
        }, 'Edit'))

        content.push(e("button", {
          type: "button",
          onClick: () => {
            currentLocation['enabled'] = !isLocationEnabled
            const newConfigFile = Object.assign({}, this?.state?.configFile);
            this.setState({ configFile: newConfigFile })
          }
        }, isLocationEnabled ? 'Disable' : 'Enable'))

        content.push(e("br", {}))

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
          content.push(e('div', { style: { marginTop: 8 } },
            /*#__PURE__*/
            e("label", {
              style: { marginRight: 8, marginTop: 8, },
              key: `${key}-${keyLocation}-label`,
              htmlFor: `${key}-${keyLocation}`
            }, keyLocation),
            /*#__PURE__*/
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
                this.setState(prevState => {
                  let newConfigFile = Object.assign({}, prevState.configFile);
                  newConfigFile.locations[key][keyLocation] = e?.target?.value
                  return { config: newConfigFile };
                })
              }
            }),
            e("br", {}),
          ))
        }
        content.push(e("br", {
          key: `${key}-spacer-main`
        }))
      }
      content.push(e("button", {
        type: 'submit'
      }, 'Save Configuration'))
    }


    return e(React.Fragment, null,
      content
    );
  }
}

const domContainer = document.querySelector('#configuration-edit-form');
ReactDOM.render(e(ConfigurationForm), domContainer);
