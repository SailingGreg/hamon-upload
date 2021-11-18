const imageFilter = function(req, file, cb) {
    // Accept xml and zip only
    if (!file.originalname.match(/\.(yml)$/)) {
        req.fileValidationError = 'Only yml files are supported!';
        return cb(new Error('Only YML files are allowed!'), false);
    }
    cb(null, true);
};
exports.imageFilter = imageFilter;
