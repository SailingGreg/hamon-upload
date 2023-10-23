import React from "react";
import styles from "./ConfigurationForm.css";
import fieldsDefinition from "../utils/fields-definition";
import uploadFile from "../utils/upload-file";
import {
  LOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
  defaultLocationConfig,
} from "../utils/constants";

const CONFIGURATION_FORM_ID = "configuration-edit-form";
const fileNameRegex = /\s|\(|\)/g;

class ConfigurationForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      configFile: null,
      currentlyEdited: null,
      currentlyEditedLocationBackup: null,
      newLocationId: false,
      configurationsToSave: [],
      searchTerm: '',
      configFileUpload: false,
      sortStatusDir: null,
      sortNameDir: null,
    };
  }

  componentDidMount() {
    fetch(LOAD_CONFIGURATION_ENDPOINT)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          window.alert(data.error);
          return;
        }
        this.setState({ configFile: data });
        setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 100);
      });

    document
      .getElementById(CONFIGURATION_FORM_ID)
      .addEventListener("submit", (e) => {
        e.preventDefault();
        const response = window.confirm(
          "Update the configuration and location file?"
        );
        if (!response) {
          return;
        }

        fetch(UPLOAD_CONFIGURATION_ENDPOINT, {
          body: JSON.stringify({
            configurationsToSave: this?.state?.configurationsToSave,
            configFile: this?.state?.configFile,
          }),
          method: "post",
          headers: {
            "Content-Type": "application/json",
          },
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.error) {
              window.alert(data.error);
              return;
            }
            if (data.msg) {
              window.alert(data.msg);
            }
            this.setState({
              currentlyEdited: null,
              newLocationId: null,
              configurationsToSave: [],
            });
          });
      });
  }

  componentWillUnmount() {
    document
      .getElementById(CONFIGURATION_FORM_ID)
      .removeEventListener("submit", null);
  }

  render() {
    const configFile = this?.state?.configFile;
    const newLocationId = this?.state?.newLocationId;
    const searchTerm = this?.state?.searchTerm;
    const configFileUpload = this?.state?.configFileUpload;
    const sortStatusDir = this?.state?.sortStatusDir;
    const sortNameDir = this?.state?.sortNameDir;

    const statusColumnTitle =
      "status" +
      (sortStatusDir === "ASC" ? "↓" : sortStatusDir === "DESC" ? "↑" : " ");
    const nameColumnTitle =
      "name" +
      (sortNameDir === "ASC" ? "↓" : sortNameDir === "DESC" ? "↑" : " ");

    if (!configFile?.locations) {
      return <form id={CONFIGURATION_FORM_ID} style={{ maxWidth: 620 }}></form>;
    }

    const locations = Object.entries(configFile?.locations);

    sortedLocations = [...locations].sort((a, b) => {
      if (!sortNameDir) {
        return 0;
      }

      const result = a[1].name.localeCompare(b[1].name, "en", {
        numeric: true,
      });
      return sortNameDir === "ASC" ? result : -result;
    });

    let sortedLocations = [...sortedLocations].sort((a, b) => {
      if (!sortStatusDir) {
        return 0;
      }

      if (!a[1].enabled && b[1].enabled) {
        return sortStatusDir === "ASC" ? 1 : -1;
      } else if (a[1].enabled && !b[1].enabled) {
        return sortStatusDir === "ASC" ? -1 : 1;
      } else {
        return 0;
      }
    });


    const fieldsDefinitionArray = Object.entries(fieldsDefinition);

    const onAddLocationPress = () => {
      const newLocationConfig = defaultLocationConfig;
      const locationsLength = Object.keys(
        this?.state?.configFile?.locations
      )?.length;
      let newConfigFile = Object.assign({}, this?.state?.configFile);
      const newLocationConfigKey = `Location-${locationsLength + 1}`;
      newConfigFile.locations[newLocationConfigKey] = Object.assign(
        {},
        newLocationConfig
      );
      this.setState({
        configFile: newConfigFile,
        currentlyEdited: newLocationConfigKey,
        newLocationId: newLocationConfigKey,
      });
    };

    const onChangeSortDirPress = (sortDirStateName) => () => {
      this.setState((prevState) => {
        let newSortDir = null;
        if (prevState[sortDirStateName] === null) {
          newSortDir = "ASC";
        } else if (prevState[sortDirStateName] === "ASC") {
          newSortDir = "DESC";
        }

        return {
          [sortDirStateName]: newSortDir,
        };
      });
    };

    const onEditCancelPress = (locationKey) => {
      const configFile = this?.state?.configFile;
      configFile.locations[locationKey] =
        this?.state?.currentlyEditedLocationBackup;
      let restoredConfigFile = Object.assign({}, configFile);
      this.setState((prevState) => ({
        currentlyEdited:
          prevState?.currentlyEdited === locationKey ? null : locationKey,
        configFile: restoredConfigFile,
        currentlyEditedLocationBackup: null,
      }));
    };

    const toggleLocation = (location) => {
      location["enabled"] = !location["enabled"];
      const newConfigFile = Object.assign({}, this?.state?.configFile);
      this.setState({ configFile: newConfigFile });
    };

    const onUpdatePress = () =>
      this.setState({
        currentlyEdited: null,
        newLocationId: null,
      });

    const uploadFileHandler =
      (locationKey, fieldDefinitionKey) => async (file) => {
        if (file && !fileNameRegex.test(file?.name)) {
          let configFilePassword;
          if (file?.type === "text/xml") {
            // HANDLE XML CONFIG
            this.setState({ configFileUpload: true });
            const uploadSuccess = await uploadFile(
              file,
              UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
              true
            );
            if (!uploadSuccess) {
              // upload failed, do not continue
              this.setState({
                configFileUpload: false,
              });
              return;
            }
          } else {
            // HANDLE KNXPROJECT CONFIG
            configFilePassword = prompt(
              "Enter config password (Leave empty is config is not secured)"
            );
            if (configFilePassword == null) {
              e.target.value = null;
              return false;
            }
            this.setState({ configFileUpload: true });
            const uploadSuccess = await uploadFile(
              file,
              UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
              true,
              configFilePassword
            );
            if (!uploadSuccess) {
              // upload failed, do not continue
              e.target.value = null;
              this.setState({
                configFileUpload: false,
              });
              return false;
            }
          }
          this.setState((prevState) => {
            let newConfigFile = Object.assign({}, prevState.configFile);
            newConfigFile.locations[locationKey][fieldDefinitionKey] =
              file?.name;
            if (configFilePassword) {
              newConfigFile.locations[locationKey][CONFIG_FILE_PASSWORD_KEY] =
                configFilePassword;
            }
            return {
              config: newConfigFile,
              configFileUpload: false,
              configurationsToSave: [
                ...prevState?.configurationsToSave,
                file?.name,
              ],
            };
          });
        } else {
          alert(
            "Incorrect file or file has incorrect name (No spaces or parentheses)"
          );
          e.target.value = null;
        }
      };

    return (
      <form
        id={CONFIGURATION_FORM_ID}
        style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}
      >
        <div className={styles["header-wrapper"]}>
          <h3 className={styles["header-title"]}>Locations:</h3>
          <input
            value={searchTerm}
            placeholder="Search.."
            className={styles["header-title"]}
            onChange={(e) => this.setState({ searchTerm: e?.target?.value })}
          />
          <span className={styles["header-title"]}>
            <button
              type="button"
              disabled={newLocationId}
              className={styles["header-action-button"]}
              onClick={onAddLocationPress}
            >
              Add Location
            </button>
            <button
              type="submit"
              disabled={configFileUpload}
              className={styles["header-action-button"]}
            >
              Save Configuration
            </button>
          </span>
        </div>
        <table style={{ flex: 1 }}>
          <tbody>
            <tr className={styles["location-wrapper"]}>
              <th
                style={{ textAlign: "center", padding: "0.5rem" }}
                onClick={onChangeSortDirPress("sortStatusDir")}
              >
                {statusColumnTitle}
              </th>
              <th
                style={{ textAlign: "center", padding: "0.5rem" }}
                onClick={onChangeSortDirPress("sortNameDir")}
              >
                {nameColumnTitle}
              </th>
              <th style={{ textAlign: "center", padding: "0.5rem" }}>
                actions
              </th>
            </tr>
            {sortedLocations?.map((sortedLocation) => {
              const locationKey = sortedLocation[0];
              const location = sortedLocation[1];
              const isLocationEnabled = location["enabled"];
              const isCurrentlyEdited =
                this.state?.currentlyEdited === locationKey;
              if (searchTerm && !(location?.name || "").includes(searchTerm)) {
                // this record dosent meet requirements of search input, skip
                return null;
              }
              const locationEnabledClassName =
                styles["dot"] +
                " " +
                styles[`${isLocationEnabled ? "bg-green" : ""}`];

              return (
                <React.Fragment key={locationKey}>
                  <tr className={styles["location-wrapper"]}>
                    <td style={{ width: 25 }}>
                      <span className={locationEnabledClassName}>
                        {isLocationEnabled}
                      </span>
                    </td>
                    <td>
                      <span className={styles["configuration-location-title"]}>
                        {location?.name}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles["location-action-button"]}
                        onClick={() => {
                          if (isCurrentlyEdited) {
                            // PRESSED CANCEL, REVERTING CHANGES
                            onEditCancelPress(locationKey);
                          } else {
                            const currentLocationData = Object.assign(
                              {},
                              this?.state?.configFile.locations[locationKey]
                            );
                            this.setState((prevState) => ({
                              currentlyEdited:
                                prevState?.currentlyEdited === locationKey
                                  ? null
                                  : locationKey,
                              currentlyEditedLocationBackup:
                                currentLocationData,
                            }));
                          }
                          if (newLocationId) {
                            delete this?.state?.configFile.locations[
                              newLocationId
                            ];
                            let newConfigFile = Object.assign(
                              {},
                              this?.state?.configFile
                            );
                            this.setState({
                              configFile: newConfigFile,
                              newLocationId: false,
                            });
                          }
                        }}
                      >
                        {isCurrentlyEdited ? "Cancel" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className={styles["location-action-button"]}
                        onClick={() => toggleLocation(location)}
                      >
                        {isLocationEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className={styles["location-action-button"]}
                        onClick={onUpdatePress}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                  {isCurrentlyEdited && (
                    <tr>
                      <td colSpan={3}>
                        {fieldsDefinitionArray.map((fieldDefinition) => {
                          const fieldDefinitionKey = fieldDefinition[0];
                          const fieldDefinitionValue = fieldDefinition[1];

                          if (fieldDefinitionValue.hidden) {
                            return null;
                          }

                          const fieldValue = location[fieldDefinitionKey];
                          const fieldId = `${locationKey}-${fieldDefinitionKey}`;
                          const isReadOnly = !!fieldDefinitionValue?.readOnly;
                          const fieldDefinitionType = fieldDefinitionValue.type;
                          const fieldDefinitionLabel =
                            fieldDefinitionValue.label;

                          let fieldComponent;
                          if (fieldDefinitionType === "boolean") {
                            fieldComponent = (
                              <select
                                id={fieldId}
                                value={
                                  typeof fieldValue == "boolean"
                                    ? fieldValue
                                    : fieldValue === "true"
                                }
                                readOnly={isReadOnly}
                                onChange={(e) => {
                                  this.setState((prevState) => {
                                    let newConfigFile = Object.assign(
                                      {},
                                      prevState.configFile
                                    );
                                    let value = e?.target?.value;

                                    if (typeof value === "string") {
                                      value = value === "true";
                                    }

                                    newConfigFile.locations[locationKey][
                                      fieldDefinitionKey
                                    ] = value;
                                    return { config: newConfigFile };
                                  });
                                }}
                              >
                                <option value={true}>true</option>
                                <option value={false}>false</option>
                              </select>
                            );
                          } else if (fieldDefinitionType === "select") {
                            fieldComponent = (
                              <select
                                id={fieldId}
                                value={fieldValue}
                                readOnly={isReadOnly}
                                onChange={(e) => {
                                  this.setState((prevState) => {
                                    let newConfigFile = Object.assign(
                                      {},
                                      prevState.configFile
                                    );
                                    newConfigFile.locations[locationKey][
                                      fieldDefinitionKey
                                    ] = e?.target?.value;
                                    return { config: newConfigFile };
                                  });
                                }}
                              >
                                {fieldDefinitionValue.values.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            );
                          } else {
                            fieldComponent = (
                              <input
                                id={fieldId}
                                type={
                                  fieldDefinition.type === "password"
                                    ? "password"
                                    : "text"
                                }
                                readOnly={isReadOnly}
                                value={fieldValue}
                                onChange={(e) => {
                                  this.setState((prevState) => {
                                    let newConfigFile = Object.assign(
                                      {},
                                      prevState.configFile
                                    );
                                    newConfigFile.locations[locationKey][
                                      fieldDefinitionKey
                                    ] = e?.target?.value;
                                    return { config: newConfigFile };
                                  });
                                }}
                              />
                            );
                          }

                          return (
                            <div
                              key={fieldDefinitionKey}
                              className={styles["location-content-wrapper"]}
                            >
                              <label
                                htmlFor={fieldId}
                                className={styles["location-content-label"]}
                              >
                                {fieldDefinitionLabel || fieldDefinitionKey}
                              </label>
                              {fieldComponent}
                              {fieldDefinitionType === "file" && (
                                <input
                                  type="file"
                                  accept=".xml,.knxproj"
                                  defaultValue=""
                                  disabled={this.state.configFileUpload}
                                  onChange={async (e) => {
                                    const file = e?.target?.files[0];
                                    await uploadFileHandler(
                                      locationKey,
                                      fieldDefinitionKey
                                    )(file);
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </form>
    );
  }
}

export default ConfigurationForm;