const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage location
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(process.cwd(), 'public', 'uploads', 'documents', 'members', req.session.registrationDraft.membership_no.toString());

        // Create directory none
        fs.mkdirSync(uploadPath, { recursive: true });

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const safeName = file.fieldname + '-' + Date.now() + ext;
        cb(null, safeName);
    }
});

// Allowed types
const fileFilter = (req, file, cb) => {
    // const allowedTypes = /jpeg|jpg|png|pdf/;
    const allowedTypes = /\.pdf$/i;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // 10MB limit
});

module.exports = upload;
