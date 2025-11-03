const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const db = require('./config/db');
const req = require('express/lib/request');
const session = require('express-session');
const { formatDate } = require('./utils/dateFormat');
// const cookieParser = require('cookie-parser');
const { ensureAuthenticated } = require('./middleware/authMiddleware');

// dotenv.config({ path: './.env'});
// Only load the .env file when running locally
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: './.env' });
}

const secretKey = require('./generateKey');

const app = express();

// Set global variable in all views
app.use((req, res, next) => {
    req.db = db;
    res.locals.currentPath = req.path; // Getting active routes
    next();
});

// Set view for the files
const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));

// Parse encoded json bodys from html form
app.use(express.urlencoded({extended: false}));
app.use(express.json());

app.set('view engine', 'ejs');

app.use(
    session({
        name: 'uthabitiSession',
        secret: secretKey,
        resave: false,
        saveUninitialized: true,
        cookie: { 
            httpOnly: true,      
            secure: true, //true only on production
            maxAge: 12 * 60 * 60 * 1000,
        }, 
    })
);

// app date format dd/mm/yyyy
app.locals.formatDate = formatDate;

// alert messages cleared
app.use((req, res, next) => {
    res.locals.message = req.session.message || null;
    res.locals.messageType = req.session.messageType || null;
    req.session.message = null;
    req.session.messageType = null;
    next();
});

// app.use(cookieParser());

// Define Routes
// ********************************************

// Landing page rendering
app.use('/', require('./routes/commons'));

// App routes
// const commonRoutes = require('./routes/commons');
// app.use('/app', commonRoutes);

const adminRoutes = require('./routes/portals');
app.use('/portal', ensureAuthenticated, adminRoutes);

const authRoutes = require('./routes/auths');
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
