#!/usr/bin/env node
/*
 * File: upload.js - simple file uploaded based on express & multer
 *
 *
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const helpers = require('./helpers');

const app = express();
const port = process.env.PORT || 8080;

loc = "/var/www/html/";
app.use(express.static(loc));
//app.use(express.static(__dirname + '/public'));


const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, loc + 'uploads/');
    },

    // By default, multer removes file extensions so let's add them back
    filename: function(req, file, cb) {
	var fname = path.basename(file.originalname, path.extname(file.originalname));
        cb(null, fname + '-' + Date.now() + path.extname(file.originalname));
    }
});

app.post('/upload-file', (req, res) => {
    // 'profile_pic' is the name of our file input field in the HTML form
    let upload = multer({ storage: storage, fileFilter: helpers.imageFilter }).single('single_file');

    upload(req, res, function(err) {
        // req.file contains information of uploaded file
        // req.body contains information of text fields, if there were any

        if (req.fileValidationError) {
            return res.send(req.fileValidationError);
        }
        else if (!req.file) {
            return res.send('Please select a data file to upload');
        }
        else if (err instanceof multer.MulterError) {
            return res.send(err);
        }
        else if (err) {
            return res.send(err);
        }

        // Display uploaded image for user validation
        res.send(`<h1>HAMon ETS File upload</h1>You have uploaded the following file: ${req.file.path} <br><br><a href="./">Upload another file</a>`);
    });
});

app.listen(port, () => console.log(`Listening on port ${port}...`));

// end of file
