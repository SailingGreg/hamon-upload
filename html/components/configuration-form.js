'use strict';

const e = React.createElement;

const fieldsDefinition = {
  'name': {
    type: 'text',
    readOnly: true
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
    this.state = { configFile: null };
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
      for (const [key, value] of Object.entries(configFile?.locations)) {
        content.push(e(React.Fragment, null,
          /*#__PURE__*/
          e("h4", { key: `${key}-header` }, key)
        ))
        for (const [keyLocation, valueLocation] of Object.entries(value)) {
          console.log('keyLocation', keyLocation)
          const fieldDefinition = fieldsDefinition[keyLocation]
          if (!fieldDefinition) {
            console.error('NO FIELD DEF')
            continue
          }

          content.push(e(React.Fragment, null,
            /*#__PURE__*/
            e("label", {
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
      }, 'Add Location'))
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
