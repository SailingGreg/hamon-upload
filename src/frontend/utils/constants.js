const defaultLocationConfig = {
  name: "new-location",
  desc: "",
  enabled: true,
  hapi: false,
  dns: "",
  port: 3671,
  device: "generic",
  phyAddr: "15.15.15",
  logging: "info",
  config: "",
};

const LOAD_CONFIGURATION_ENDPOINT = "/load-configuration-file";
const UPLOAD_CONFIGURATION_ENDPOINT = "/upload-configuration-file";
const UPLOAD_LOCATION_CONFIGURATION_ENDPOINT =
  "/upload-location-configuration-file";
// relative so it goes through nginx's /upload/ proxy (needs no extra location)
const DNS_STATUS_ENDPOINT = "dns-status";
const SITE_STATE_ENDPOINT = "site-state";
const RECHECK_SITE_ENDPOINT = "recheck-site";


export {
  LOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_CONFIGURATION_ENDPOINT,
  UPLOAD_LOCATION_CONFIGURATION_ENDPOINT,
  DNS_STATUS_ENDPOINT,
  SITE_STATE_ENDPOINT,
  RECHECK_SITE_ENDPOINT,
  defaultLocationConfig
}