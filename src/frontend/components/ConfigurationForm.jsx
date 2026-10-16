import React from "react";
import styles from "./ConfigurationForm.css";
import fieldsDefinition, {
  CONFIG_FILE_PASSWORD_KEY,
  effectiveStack,
} from "../utils/fields-definition";
import uploadFile from "../utils/upload-file";
import {
  LOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
  DNS_STATUS_ENDPOINT,
  SITE_STATE_ENDPOINT,
  RECHECK_SITE_ENDPOINT,
  defaultLocationConfig,
} from "../utils/constants";
import {
  // HiSignal,
  // HiSignalSlash,
  // HiMiniArrowsUpDown,
  HiOutlineMinus,
  HiMiniArrowDown,
  HiMiniArrowUp,
} from "react-icons/hi2";
import UploadingFileSpinner from "./UploadingFileSpinner";

const CONFIGURATION_FORM_ID = "configuration-edit-form";
const fileNameRegex = /\s|\(|\)/g;
const ipv4Regex = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const SITE_STATE_POLL_MS = 30 * 1000;

// a site-state time as '16 Oct 13:47' in the browser's time zone
const when = (iso) => {
  const d = new Date(iso);
  return isNaN(d)
    ? "?"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

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
      sortStatusDir: null,
      sortNameDir: null,
      dnsStatus: {},
      siteState: null,
      rechecking: {}, // site name -> "checking", while its Re-check is under way
    };
  }

  // hamon's own state for each site (tmp/site-state.json via the backend):
  // connected, starting, down, blocked or disabled. Polled, as it changes
  // without anything happening on this page
  loadSiteState() {
    fetch(SITE_STATE_ENDPOINT)
      .then((response) => response.json())
      .then((data) => {
        if (!data || data.error === "You are not logged in") return;
        this.setState({ siteState: data });
      })
      .catch(() => {});
  }

  // Re-check button: ha-mon tries a blocked site again now (via its kpipe).
  // The button says "Checking..." until the result is in (the dns lookup and
  // gateway check take up to ~5s), then "Re-check" again - or goes, with the
  // dot, if the site is no longer blocked
  recheckSite(name) {
    const mark = (value) =>
      this.setState((prev) => {
        const rechecking = { ...prev.rechecking };
        if (value) rechecking[name] = value;
        else delete rechecking[name];
        return { rechecking };
      });
    mark("checking");
    fetch(RECHECK_SITE_ENDPOINT, {
      body: JSON.stringify({ name }),
      method: "post",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error || !data.success) {
          mark(null);
          window.alert(data.error || data.msg);
          return;
        }
        setTimeout(() => this.loadSiteState(), 4000);
        setTimeout(() => {
          this.loadSiteState();
          mark(null);
        }, 10000);
      })
      .catch(() => {
        mark(null);
        window.alert("Re-check failed");
      });
  }

  componentWillUnmount() {
    clearInterval(this.siteStatePoll);
  }

  // which enabled sites' dns entries resolve (amber dot when they don't);
  // checks the saved hamon.yml, so it is re-run after each save
  loadDnsStatus() {
    fetch(DNS_STATUS_ENDPOINT)
      .then((response) => response.json())
      .then((data) => {
        if (!data || data.error) return;
        this.setState({ dnsStatus: data });
      })
      .catch(() => {});
  }

  // the dot for a site: { colour, tip, rank }. hamon's state when it has one
  // for the saved entry; otherwise (no state file, a new or just-enabled
  // site, an unsaved dns edit) the dns check, as before
  siteStatus(locationKey, location) {
    const dnsEntry = String(location?.dns || "").trim();
    const dnsCheck = this.state?.dnsStatus?.[locationKey];
    const dnsChecked = dnsCheck && dnsCheck.dns === dnsEntry;
    if (!location?.enabled) return { colour: "grey", tip: "Disabled", rank: 4 };
    if (!dnsEntry)
      return { colour: "amber", tip: "No dns entry - hamon cannot connect", rank: 3 };
    if (dnsCheck && !dnsChecked)
      return { colour: "amber", tip: `${dnsEntry} not checked yet - save to check`, rank: 3 };

    const hamon = this.state?.siteState;
    const st = hamon?.available ? hamon.sites?.[location.name] : null;
    if (st && st.state !== "disabled") {
      const stale = hamon.running ? "" : "ha-mon not running - last known: ";
      const last = st.lastConnected
        ? `; last connected ${when(st.lastConnected)}`
        : "; no connection recorded";
      switch (st.state) {
        case "connected":
          return { colour: "green", tip: `${stale}Connected since ${when(st.since)}`, rank: 0 };
        case "starting":
          return {
            colour: "blue",
            tip: `${stale}Connecting since ${when(st.since)}` +
              (st.failures > 0 ? ` (attempt ${st.failures + 1})` : "") + last,
            rank: 1,
          };
        case "down":
          return {
            colour: "red",
            tip: `${stale}Off-line since ${when(st.since)}` +
              (st.nextRetry ? ` - retry ${st.failures + 1} at ${when(st.nextRetry)}` : "") + last,
            rank: 2,
          };
        case "blocked":
          return {
            colour: "amber",
            tip: `${stale}Blocked: ${st.detail || st.reason} - not retried; ` +
              "Re-check, or change and save this site, to try again",
            rank: 3,
            recheck: hamon.running,
          };
      }
    }

    // green only when the address is known good: an IPv4 address, or a
    // hostname the backend has resolved
    if (ipv4Regex.test(dnsEntry))
      return { colour: "green", tip: `Enabled - ${dnsEntry}`, rank: 0 };
    if (dnsChecked && dnsCheck.ok)
      return { colour: "green", tip: `Enabled - ${dnsEntry} resolves to ${dnsCheck.address}`, rank: 0 };
    if (dnsChecked)
      return { colour: "amber", tip: `${dnsEntry} ${dnsCheck.error} - hamon cannot connect`, rank: 3 };
    return { colour: "amber", tip: `${dnsEntry} not checked yet - save to check`, rank: 3 };
  }

  componentDidMount() {
    // reading configuration
    fetch(LOAD_CONFIGURATION_ENDPOINT)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          window.alert(data.error);
          return;
        }

        this.setState({ configFile: data });
        this.loadDnsStatus();
        this.loadSiteState();
        this.siteStatePoll = setInterval(() => this.loadSiteState(), SITE_STATE_POLL_MS);
        setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 100);
      });
  }

  render() {
    const configFile = this?.state?.configFile;
    const newLocationId = this?.state?.newLocationId;
    const searchTerm = this?.state?.searchTerm;
    const sortStatusDir = this?.state?.sortStatusDir;
    const sortNameDir = this?.state?.sortNameDir;
    const setUploadingFile = this?.props?.setUploadingFile;
    const configFileUpload = this?.props?.uploadingFile;

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

      // same order as the dot colours: green, blue, red, amber, grey (ASC)
      const rank = ([key, loc]) => this.siteStatus(key, loc).rank;
      const result = rank(a) - rank(b);
      return sortStatusDir === "ASC" ? result : -result;
    });

    const fieldsDefinitionArray = Object.entries(fieldsDefinition);

    // one count per dot colour, so they always add up to the total
    const dotCounts = { green: 0, blue: 0, red: 0, amber: 0, grey: 0 };
    for (const [key, loc] of locations) {
      dotCounts[this.siteStatus(key, loc).colour]++;
    }
    const hamonState = this.state?.siteState;

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
          this.loadDnsStatus();
          // hamon picks the change up within seconds; show what it made of it
          setTimeout(() => this.loadSiteState(), 5000);
          setTimeout(() => this.loadSiteState(), 20000);
        });
    };

    const onAddLocationPress = () => {
      const newLocationConfig = defaultLocationConfig;
      const existingLocations = this?.state?.configFile?.locations || {};
      let newConfigFile = Object.assign({}, this?.state?.configFile);
      // use max existing Location-N index + 1 so prior deletes don't collide
      const maxIdx = Object.keys(existingLocations).reduce((m, k) => {
        const n = parseInt((k.match(/^Location-(\d+)$/) || [])[1], 10);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      const newLocationConfigKey = `Location-${maxIdx + 1}`;
      newConfigFile.locations[newLocationConfigKey] = Object.assign(
        {},
        newLocationConfig
      );
      this.setState(
        {
          configFile: newConfigFile,
          currentlyEdited: newLocationConfigKey,
          newLocationId: newLocationConfigKey,
        },
        () => {
          // move focus to the new location's Name field so it's obvious where
          // the just-added row is (it renders at the bottom of a long list)
          const nameField = document.getElementById(`${newLocationConfigKey}-name`);
          if (nameField) {
            nameField.scrollIntoView({ behavior: "smooth", block: "center" });
            nameField.focus();
          }
        }
      );
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
          if (file?.type === "text/xml") {
            // HANDLE XML CONFIG
            setUploadingFile(true);
            const uploadSuccess = await uploadFile(
              file,
              UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
              true
            );
            if (!uploadSuccess) {
              // upload failed, do not continue
              setUploadingFile(false);
              return;
            }
          } else {
            // HANDLE KNXPROJECT CONFIG
            configFilePassword = prompt(
              "Enter config password (Leave empty if config is not secured)"
            );
            if (configFilePassword == null) {
              target.value = null;
              return false;
            }
            setUploadingFile(true);
            const uploadSuccess = await uploadFile(
              file,
              UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
              true,
              configFilePassword
            );
            if (!uploadSuccess) {
              // upload failed, do not continue
              target.value = null;
              setUploadingFile(false);
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
            setUploadingFile(false);
            return {
              config: newConfigFile,
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
        onKeyDown={(e) => {
          // don't let Enter in a text/file field submit the form (and pop the save confirm)
          if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault();
        }}
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
        <div className={styles["site-counts"]}>
          {locations.length} sites · {dotCounts.green} green · {dotCounts.blue} blue ·{" "}
          {dotCounts.red} red · {dotCounts.amber} amber · {dotCounts.grey} grey
        </div>
        <div className={styles["site-legend"]}>
          green connected · blue connecting · red off-line · amber blocked · grey
          disabled
        </div>
        {hamonState?.available && !hamonState.running && (
          <div className={styles["hamon-banner"]}>
            ha-mon is not running - the dots show the last known state
            {hamonState.updated ? ` (${when(hamonState.updated)})` : ""}
          </div>
        )}
        {hamonState && !hamonState.available && (
          <div className={styles["site-legend"]}>
            No site state from hamon ({hamonState.error}) - the dots show the dns check only
          </div>
        )}
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
                  textAlign: "left",
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
              if (searchTerm && !(location?.name || "").toLowerCase().includes(searchTerm.toLowerCase())) {
                // this record dosent meet requirements of search input, skip
                return null;
              }
              const dnsEntry = String(location?.dns || "").trim();
              const dnsCheck = this.state?.dnsStatus?.[locationKey];
              const dnsChecked = dnsCheck && dnsCheck.dns === dnsEntry;
              const status = this.siteStatus(locationKey, location);
              const locationEnabledClassName =
                styles["dot"] +
                " " +
                (status.colour === "grey" ? "" : styles[`bg-${status.colour}`]);
              const locationStatusTitle = status.tip;

              return (
                <React.Fragment key={locationKey}>
                  <tr className={styles["location-wrapper"]}>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={locationEnabledClassName}
                        data-tip={locationStatusTitle}
                        aria-label={locationStatusTitle}
                        tabIndex={0}
                      >
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
                    {/* left-aligned so Edit/Disable/Update line up whether or not a
                        row has a Re-check button */}
                    <td style={{ textAlign: "left", padding: "0 0.5rem" }}>
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
                            // after the backup, so Cancel takes it out again:
                            // an edited site gets the missing keys marked
                            // fillOnEdit (none at present)
                            const liveLocation =
                              this?.state?.configFile.locations[locationKey];
                            for (const [key, def] of fieldsDefinitionArray) {
                              if (def.fillOnEdit && liveLocation[key] === undefined) {
                                liveLocation[key] = def.default;
                              }
                            }
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
                      {(status.recheck || this.state.rechecking[location.name] === "checking") && (
                        <button
                          type="button"
                          className={styles["location-action-button"]}
                          title="Ask hamon to try this site again now"
                          disabled={!!this.state.rechecking[location.name]}
                          onClick={() => this.recheckSite(location.name)}
                        >
                          {this.state.rechecking[location.name] === "checking"
                            ? "Checking…"
                            : "Re-check"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isCurrentlyEdited && (
                    <tr>
                      <td colSpan={3} style={{ position: "relative" }}>
                        {fieldsDefinitionArray.map((fieldDefinition) => {
                          const fieldDefinitionKey = fieldDefinition[0];
                          const fieldDefinitionValue = fieldDefinition[1];

                          if (fieldDefinitionValue.hidden) {
                            return null;
                          }

                          const fieldValue = location[fieldDefinitionKey];
                          const fieldId = `${locationKey}-${fieldDefinitionKey}`;
                          const isReadOnly = !!fieldDefinitionValue?.readOnly;
                          // a field that only applies with another field's value
                          // (KNX Secure needs the knxultimate stack): greyed out
                          // otherwise; an absent value counts as its default,
                          // and the stack as the one the site runs on
                          const unmetRequirement = Object.entries(
                            fieldDefinitionValue.requires || {}
                          ).find(
                            ([key, wanted]) =>
                              (key === "stack"
                                ? effectiveStack(location, this?.state?.configFile)
                                : location[key] ?? fieldsDefinition[key]?.default) !==
                              wanted
                          );
                          const isDisabled = !!unmetRequirement;
                          const disabledStyle = isDisabled
                            ? { opacity: 0.45, cursor: "not-allowed" }
                            : {};
                          const disabledTitle = unmetRequirement
                            ? `Needs ${fieldsDefinition[unmetRequirement[0]]?.label?.replace(/:$/, "") || unmetRequirement[0]} ${unmetRequirement[1]}`
                            : undefined;
                          const fieldDefinitionType = fieldDefinitionValue.type;
                          const fieldDefinitionLabel =
                            fieldDefinitionValue.label;

                          let fieldComponent;
                          if (fieldDefinitionType === "boolean") {
                            fieldComponent = (
                              <select
                                id={fieldId}
                                style={{ minWidth: 150, ...disabledStyle }}
                                value={
                                  typeof fieldValue == "boolean"
                                    ? fieldValue
                                    : fieldValue === "true"
                                }
                                readOnly={isReadOnly}
                                disabled={isDisabled}
                                title={disabledTitle}
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
                                value={fieldValue ?? fieldDefinitionValue.default}
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
                                    {value === "" && fieldDefinitionKey === "stack"
                                      ? `default (${effectiveStack({}, this?.state?.configFile)})`
                                      : fieldDefinitionValue.labels?.[value] ?? value}
                                  </option>
                                ))}
                              </select>
                            );
                          } else {
                            fieldComponent = (
                              <input
                                id={fieldId}
                                style={{ minWidth: 220, ...disabledStyle }}
                                disabled={isDisabled}
                                title={disabledTitle}
                                type={
                                  fieldDefinitionType === "password"
                                    ? "password"
                                    : "text"
                                }
                                readOnly={isReadOnly}
                                value={fieldValue ?? ""}
                                // a stored password arrives as a placeholder:
                                // select it so typing replaces it, and
                                // clearing the field removes the password
                                onFocus={
                                  fieldDefinitionType === "password"
                                    ? (e) => e.target.select()
                                    : undefined
                                }
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
                              {fieldDefinitionKey === "dns" &&
                                dnsChecked &&
                                !dnsCheck.ok && (
                                  <span className={styles["dns-note"]}>
                                    {dnsEntry
                                      ? "Doesn't resolve - site will not work"
                                      : "No address - site will not work"}
                                  </span>
                                )}
                              {fieldDefinitionType === "file" && (
                                <input
                                  type="file"
                                  accept=".xml,.knxproj"
                                  defaultValue=""
                                  disabled={configFileUpload}
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
                        <UploadingFileSpinner enabled={configFileUpload} />
                        <div
                          className={styles["location-content-wrapper"]}
                          style={{ marginTop: 12 }}
                        >
                          <button
                            type="button"
                            className={styles["location-action-button"]}
                            onClick={() => window.location.reload()}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={configFileUpload}
                            className={styles["location-action-button"]}
                          >
                            Save Configuration
                          </button>
                        </div>
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
