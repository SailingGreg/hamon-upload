#!/usr/bin/env node
/*
 * File: backend.js - simple file backend for HAMon ETS configuration upload utility
 *
 *
 */

const express = require('express');
const http = require('http'); // added for ssl support
const https = require('https');
const fileupload = require("express-fileupload");
const cookieParser = require("cookie-parser");
const bodyParser = require('body-parser');
const yaml = require('js-yaml');
const app = express();
const port = process.env.PORT || 8080;
const fs = require('fs');
const path = require('path');
const { etsProjectParser } = require('./src/backend/utils/etsProjectParser');
const NODE_ENV = process.env.NODE_ENV || 'development';

// for production
const key_file = "/etc/letsencrypt/live/home.monitor-software.com/privkey.pem"
const cert_key = "/etc/letsencrypt/live/home.monitor-software.com/cert.pem"
const ca_file = "/etc/letsencrypt/live/home.monitor-software.com/chain.pem"
const dev_cert = __dirname + "/../certs/selfsigned.crt"
const dev_key = __dirname + "/../certs/selfsigned.key"

//--- !!!! CONFIGURATION !!!! ---//
// Note this is where the configuration and location files reside
// the location .xml need to be moved here
const CONFIGURATION_FILE_LOCATION = __dirname + '/../hamon'
// const CONFIGURATION_FILE_LOCATION = __dirname + '/uploads'
const CONFIGURATION_FILE_NAME = 'hamon.yml'
const LOCATION_CONFIGURATION_FILES_LOCATION = __dirname + '/uploads/'
const LOCATION_CONFIGURATION_FILES_DESTINATION = '/config/'
// SETUP THIS ONLY IF WE ARE READING CONFIG FROM OTHER PLACE, FOR EXAMPLE WE WANT USER TO NOT OVERRIDE BASIC CONFIGURATION AND SAVE IT SOMEWHERE ELSE
const READ_CONFIGURATION_FILE_FROM = __dirname + '/../hamon'
// const READ_CONFIGURATION_FILE_FROM = __dirname + '/example-files'
const SECURITY_COOKIE_NAME = 'grafana_session'
//--- !!!! END OF CONFIGURATION !!!! ---//

app.use(express.static(__dirname + '/dist'));
app.use('/static', express.static(__dirname + '/dist/static'));
app.use(cookieParser());
app.use(fileupload());
app.use(bodyParser.json());

function checkCookie(req, res) {
  if (!req.cookies[SECURITY_COOKIE_NAME]) {
    // !IMPORTANT TODO: ADDITIONAL COOKIE CHECK, CANNOT DO THIS WITH PROVIDED DATA, CHECKING ONLY IF COOKIE EXISTS
    return res.json({ error: 'You are not logged in' })
  }
}

function saveFile(basePath, fileName, file, disableBackup = false) {
  if (fs.existsSync(`${basePath}/${fileName}`) && !disableBackup) {
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

function moveFile(originalPath, destinationPath, fileName) {
  console.log(`Moving file: "${fileName}" from "${originalPath}" to "${destinationPath}" `)
  if (!fs.existsSync(destinationPath)) {
    // Check if destination folder exits, if not create it
    fs.mkdirSync(destinationPath);
  }
  if (fs.existsSync(`${destinationPath}/${fileName}`)) {
    // file exists, create backup first, then move
    const timestamp = Date.now()
    fs.renameSync(`${destinationPath}/${fileName}`, `${destinationPath}/${fileName}.${timestamp}`)
    // move file
    fs.renameSync(`${originalPath}/${fileName}`, `${destinationPath}/${fileName}`)
  } else {
    // file dosent exists, move file without backup
    fs.renameSync(`${originalPath}/${fileName}`, `${destinationPath}/${fileName}`)
  }
}

app.post('/upload-configuration-file', (req, res) => {
  checkCookie(req, res)
  let configurationFile
  try {
    configurationFile = yaml.dump(req?.body?.configFile)
  } catch (err) {
    console.error(err)
  }
  if (!configurationFile) {
    return res.json({ success: false, msg: "File was not found/Incorrect file" });
  }

  try {
    if (req?.body?.configurationsToSave && req?.body?.configurationsToSave?.length > 0) {
      req?.body?.configurationsToSave.forEach((configurationToSaveFileName) => {
        try {
          moveFile(LOCATION_CONFIGURATION_FILES_LOCATION, CONFIGURATION_FILE_LOCATION + LOCATION_CONFIGURATION_FILES_DESTINATION, configurationToSaveFileName) 
          const knxprojectParsedJsonName = configurationToSaveFileName.substr(0, configurationToSaveFileName.lastIndexOf('.')) + '.json'
          if (path.extname(configurationToSaveFileName) === '.knxproj' && fs.existsSync(LOCATION_CONFIGURATION_FILES_LOCATION + knxprojectParsedJsonName)) {
            moveFile(LOCATION_CONFIGURATION_FILES_LOCATION, CONFIGURATION_FILE_LOCATION + LOCATION_CONFIGURATION_FILES_DESTINATION, knxprojectParsedJsonName) 
          }
        } catch (err) {
          console.error(`Moving location config files failed on ${configurationToSaveFileName}, skipping move this file`)
        }
      })
    }
  } catch (err) {
    console.error('Moving location config files failed')
  }

  saveFile(CONFIGURATION_FILE_LOCATION, CONFIGURATION_FILE_NAME, configurationFile)
  return res.json({ success: true, msg: "File saved successfully" });
});

app.post('/upload-location-configuration-file', async (req, res) => {
  checkCookie(req, res)
  const file = req?.files?.configFile
  const configFilePassword = req.body.configFilePassword

  if (!file) {
    return res.json({ success: true, msg: "File was not found" });
  }

  saveFile(LOCATION_CONFIGURATION_FILES_LOCATION, file.name, file?.data, true)

  if (path.extname(file?.name) === '.knxproj') {
    // console.log('knx project file', LOCATION_CONFIGURATION_FILES_LOCATION)
    // TODO: add logic to parse knx project file

    await etsProjectParser(`${LOCATION_CONFIGURATION_FILES_LOCATION}/${file.name}`, configFilePassword)
      .then((project) => {
        addr = 0;
        dpts = 0;
        ga = 0;
        const groupAddresses = project.groupAddresses
        for (let key in groupAddresses) {
          addr++;
          if (groupAddresses.hasOwnProperty(key)) {
            //if (groupAddresses[key].dpt != undefined)
            if (groupAddresses[key].datapointType != undefined)
              dpts++;
            // console.log(key, groupAddresses[key].dpt,
            //     groupAddresses[key].name);
            ga++;
          }
        }
        const outputFilePath = LOCATION_CONFIGURATION_FILES_LOCATION + file.name
        outputFile = outputFilePath.substring(0, outputFilePath.lastIndexOf('.')) + ".json";
        fs.writeFile(outputFile, JSON.stringify(groupAddresses), err => {
          if (err) {
            return res.json({ success: false, msg: "Error while trying to save config file" });
          }
          console.log('Address data is saved to ' + outputFile + ' file');
        });
        console.log("%s has %d entries, %d with values and %d DPTs", outputFilePath, addr, ga, dpts);
        return res.json({ success: true, msg: "Location configuration file saved successfully" });
      }).catch(err => {
        if (err.message == 'BAD_PASSWORD') {
          return res.json({ success: false, msg: "Passed password is incorrect" });
        } else if (err.message == 'MISSING_PASSWORD') {
          return res.json({ success: false, msg: "This is secured knxproject file, password is required" });
        } else {
          return res.json({ success: false, msg: "Unknown error while parsing knx project file" });
        }
      })
  } else {
    return res.json({ success: true, msg: "Location configuration file saved successfully" });
  }

});

app.get('/load-configuration-file', (req, res) => {
  checkCookie(req, res)
  let configFile
  try {
    configFile = yaml.load(fs.readFileSync(`${READ_CONFIGURATION_FILE_FROM || CONFIGURATION_FILE_LOCATION}/${CONFIGURATION_FILE_NAME}`, 'utf8'));
     //console.log(configFile) 
      
    let newConfig = {
          title : configFile["title"],
          influxdb : configFile["influxdb"],
          locations : {
            }
      }
     // create new object template
    tmpl = {
        name: "",
        desc: "",
        enabled: false,
        hapi: false,
        dns: "",
        port: 1371,
        device: "generic",
        phyAddr: "15.15.15",
        logging: 'info',
        config: ""
     }
     // could make the following conditional on no existing entries
     //if (configFile.locations['Location-1']["hapi"] === undefined) {}
     // map the fields
     for (loc in configFile.locations) {
         const tmp = Object.create(tmpl)
         //console.log( loc)
         // copy location and add hapi if not defined
         //console.log(configFile.locations[loc])
         tmp.name = configFile.locations[loc]["name"]
         tmp.desc = configFile.locations[loc]["desc"]
         tmp.enabled = configFile.locations[loc]["enabled"]
         if (configFile.locations[loc]["hapi"] === undefined) {
             tmp.hapi = false
         } else {
             tmp.hapi = configFile.locations[loc]["hapi"]
         }   
         tmp.dns = configFile.locations[loc]["dns"]
         tmp.port = configFile.locations[loc]["port"]
         tmp.device = configFile.locations[loc]["device"]
         tmp.phyAddr = configFile.locations[loc]["phyAddr"]
         tmp.logging = configFile.locations[loc]["logging"]
         tmp.config = configFile.locations[loc]["config"]

         //console.log(loc)
         // this is not right!
         newConfig["locations"][loc] = tmp
     }
     //console.log(newConfig)
     configFile = newConfig
  } catch (err) {
    return res.json({ error: 'Configuration file not found' })
  }
  return res.json(configFile)
});

// check files and load cert and key
if (NODE_ENV === 'production' && fs.existsSync(key_file)) { // production
  var key = fs.readFileSync(key_file);
  var cert = fs.readFileSync(cert_key);
}

var serverOptions = {
  key: key,
  cert: cert
};

let server
if(NODE_ENV === 'development') {
  server = http.createServer({}, app);
} else {
  server = https.createServer(serverOptions, app);
}

server.listen(port, () => {
  console.log(`server starting on port : ${port} ...`)
});
//app.listen(port, () => console.log(`Listening on port ${port}...`));

// end of file
