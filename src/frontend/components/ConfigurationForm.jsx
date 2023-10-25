import React from "react";
import styles from "./ConfigurationForm.css";
import fieldsDefinition, { CONFIG_FILE_PASSWORD_KEY } from "../utils/fields-definition";
import uploadFile from "../utils/upload-file";
import {
  LOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
  defaultLocationConfig,
} from "../utils/constants";
import {
  HiSignal,
  HiSignalSlash,
  HiMiniArrowsUpDown,
  HiOutlineMinus,
  HiMiniArrowDown,
  HiMiniArrowUp,
} from "react-icons/hi2";

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
      searchTerm: "",
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
  }

  render() {
    const configFile = this?.state?.configFile;
    const newLocationId = this?.state?.newLocationId;
    const searchTerm = this?.state?.searchTerm;
    const configFileUpload = this?.state?.configFileUpload;
    const sortStatusDir = this?.state?.sortStatusDir;
    const sortNameDir = this?.state?.sortNameDir;

    const statusColumnIcon =
      sortStatusDir === "ASC" ? (
        <HiMiniArrowDown />
      ) : sortStatusDir === "DESC" ? (
        <HiMiniArrowUp />
      ) : (
        <HiOutlineMinus />
      );
    const nameColumnIcon =
      sortNameDir === "ASC" ? (
        <HiMiniArrowDown />
      ) : sortNameDir === "DESC" ? (
        <HiMiniArrowUp />
      ) : (
        <HiOutlineMinus />
      );

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

    const onSubmit = (e) => {
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
    }

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
      (locationKey, fieldDefinitionKey) => async (file, target) => {
        if (file && !fileNameRegex.test(file?.name)) {
          let configFilePassword;
          console.log('file?.type ', file?.type )
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
              target.value = null;
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
              target.value = null;
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
          target.value = null;
        }
      };

    return (
      <form
        id={CONFIGURATION_FORM_ID}
        style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}
        onSubmit={onSubmit}
      >
        <div className={styles["header-wrapper"]}>
          <h2 className={styles["header-title"]}>Locations:</h2>
          <input
            value={searchTerm}
            placeholder="Search.."
            style={{ padding: 4 }}
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
                style={{
                  padding: "0.5rem",
                  minWidth: 80,
                }}
                onClick={onChangeSortDirPress("sortStatusDir")}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  status
                  {statusColumnIcon}
                </span>
              </th>
              <th
                style={{
                  padding: "0.5rem",
                  minWidth: 150,
                }}
                onClick={onChangeSortDirPress("sortNameDir")}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  name
                  {nameColumnIcon}
                </span>
              </th>
              <th
                style={{
                  padding: "0.5rem",
                  minWidth: 150,
                }}
              >
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
                    <td style={{ textAlign: "center" }}>
                      <span className={locationEnabledClassName}>
                        {/* {(
                          <HiSignal
                            color="white"
                            size={24}
                            style={{ marginTop: 2 }}
                          />
                        ) : (
                          <HiSignalSlash
                            color="black"
                            size={24}
                            style={{ marginTop: 2 }}
                          />
                        )} */}
                      </span>
                    </td>
                    <td>
                      <span className={styles["configuration-location-title"]}>
                        {location?.name}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
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
                                style={{ minWidth: 150 }}
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
                                style={{ minWidth: 220 }}
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
                                style={{ minWidth: 220 }}
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
                                style={{ minWidth: 100 }}
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
                                    )(file, e?.target);
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
