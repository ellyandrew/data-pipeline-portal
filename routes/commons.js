const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const db = require('../config/db');

// Landing page rendering________________________________________________________________________________
router.get('/', async (req, res) => {
    try {
        res.render('index', {
            
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// =================================================================================================
// Shared app pages in app rendering
// =================================================================================================
router.get('/:page', (req, res) => {
    const page = req.params.page;
    const validPage = page.replace(/[^a-zA-Z0-9-_]/g, '');
    const filePath = path.join(__dirname, '../views/app', `${validPage}.ejs`);
    const message = req.session.message || null;
    const messageType = req.session.messageType || null;

    // Clear session messages
    req.session.message = null;
    req.session.messageType = null;
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Page Not Found');
    }
    res.render(`app/${validPage}`, {
        message,
        messageType,
        values: {},
    });
});


module.exports = router;
