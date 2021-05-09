const imageFilter = function(req, file, cb) {
    // Accept xml and zip only
    if (!file.originalname.match(/\.(xml|zip)$/)) {
        req.fileValidationError = 'Only xml or zip files are supported!';
        return cb(new Error('Only ETS files are allowed!'), false);
    }
    cb(null, true);
};
exports.imageFilter = imageFilter;
