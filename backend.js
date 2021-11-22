#!/usr/bin/env node
/*
 * File: backend.js - simple file backend for HAMon ETS configuration upload utility
 *
 *
 */

const express = require('express');
const fileupload = require("express-fileupload");
const cookieParser = require("cookie-parser");
const yaml = require('js-yaml');
const app = express();
const port = process.env.PORT || 8080;
const fs = require('fs');

//--- !!!! CONFIGURATION !!!! ---//
// Note this is where the configuration and location files reside
// the location .xml need to be moved here
const CONFIGURATION_FILE_LOCATION = __dirname + '/../hamon'
// const CONFIGURATION_FILE_LOCATION = __dirname + '/uploads'
const CONFIGURATION_FILE_NAME = 'hamon.yml'
const LOCATION_CONFIGURATION_FILES_LOCATION = __dirname + '/uploads/'
// SETUP THIS ONLY IF WE ARE READING CONFIG FROM OTHER PLACE, FOR EXAMPLE WE WANT USER TO NOT OVERRIDE BASIC CONFIGURATION AND SAVE IT SOMEWHERE ELSE
const READ_CONFIGURATION_FILE_FROM = __dirname + '/../hamon'
// const READ_CONFIGURATION_FILE_FROM = __dirname + '/example-files'
const SECURITY_COOKIE_NAME = 'grafana_session'
//--- !!!! END OF CONFIGURATION !!!! ---//

app.use(fileupload());
app.use(cookieParser());
app.use(express.static(__dirname + '/html'));

function checkCookie(req, res) {
  if (!req.cookies[SECURITY_COOKIE_NAME]) {
    // !IMPORTANT TODO: ADDITIONAL COOKIE CHECK, CANNOT DO THIS WITH PROVIDED DATA, CHECKING ONLY IF COOKIE EXISTS
    return res.json({ error: 'You are not logged in' })
  }
}

function saveFile(basePath, fileName, file) {
  if (fs.existsSync(`${basePath}/${fileName}`)) {
    // file exists, create backup first, then save
    const timestamp = Date.now()
    fs.renameSync(`${basePath}/${fileName}`, `${basePath}/${fileName}.${timestamp}`)
    // save file
    fs.writeFileSync(`${basePath}/${fileName}`, file);
  } else {
    // file dosent exists, save file without backup
    fs.writeFileSync(`${basePath}/${fileName}`, file);
  }
}

app.post('/upload-configuration-file', (req, res) => {
  checkCookie(req, res)
  const file = req?.files?.configFile
  if (!file) {
    return res.json({ success: false, msg: "File was not found" });
  }
  
  saveFile(CONFIGURATION_FILE_LOCATION, CONFIGURATION_FILE_NAME, file?.data)
  return res.json({ success: true, msg: "File saved successfully" });
});

app.post('/upload-location-configuration-file', (req, res) => {
  checkCookie(req, res)
  const file = req?.files?.configFile
  if (!file) {
    return res.json({ success: true, msg: "File was not found" });
  }

  saveFile(LOCATION_CONFIGURATION_FILES_LOCATION, file.name, file?.data)
  return res.json({ success: true, msg: "Location configuration file saved successfully" });
});

app.get('/load-configuration-file', (req, res) => {
  checkCookie(req, res)
  const configFile = yaml.load(fs.readFileSync(`${READ_CONFIGURATION_FILE_FROM || CONFIGURATION_FILE_LOCATION}/${CONFIGURATION_FILE_NAME}`, 'utf8'));
  return res.json(configFile)
});

app.use('/scripts', express.static(__dirname + '/node_modules/js-yaml/dist'));
app.listen(port, () => console.log(`Listening on port ${port}...`));

// end of file
