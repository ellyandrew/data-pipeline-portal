const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authController = require('../controllers/authController');
const session = require('express-session');
// const auth = require('../middleware/authMiddleware');
const { body } = require('express-validator');
const secretKey = require('../generateKey');
const regionMap = require('../utils/regionMap');

// -----------------------------------------------------------------------------------------------
// REGISTER USER
// -----------------------------------------------------------------------------------------------

router.post('/register-user', authController.registerUser);

// -----------------------------------------------------------------------------------------------
// GET COUNTY , SUB-COUNTY & WARDS
// ----------------------------------------------------------------------------------------------
router.get("/api/regions/counties", (req, res) => { // Get all counties
  const counties = Object.keys(regionMap).map(name => ({ name, code: regionMap[name].code }));
  res.json(counties);
});
// -----------------------------------------------------------------------------------------------
router.get("/api/regions/subcounties/:county", (req, res) => { // Get subcounties by county
  const { county } = req.params;
  if (!regionMap[county]) return res.status(404).json({ error: "County not found" });
  const subcounties = Object.keys(regionMap[county].subcounties).map(name => ({
    name,
    code: regionMap[county].subcounties[name].code
  }));
  res.json(subcounties);
});
// -----------------------------------------------------------------------------------------------
router.get("/api/regions/wards/:county/:subcounty", (req, res) => { // Get wards by county + subcounty
  const { county, subcounty } = req.params;
  if (!regionMap[county] || !regionMap[county].subcounties[subcounty]) {
    return res.status(404).json({ error: "Subcounty not found" });
  }
  const wards = regionMap[county].subcounties[subcounty].wards;
  res.json(wards);
});

// -------------------------------------------------------------------------------------------------
// LOGIN USER 
// -------------------------------------------------------------------------------------------------
router.post('/login', [
        body('email')
            .notEmpty().withMessage('Email is required.')
            .custom((value) => {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    throw new Error('Enter valid email address.');
                }
                return true;
            }),
        body('password')
            .notEmpty().withMessage('Password is required.')
            .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.')
], authController.loginUser);


// ------------------------------------------------------------------------------------------------
// FORGOT PASSWORD
// ------------------------------------------------------------------------------------------------
router.post('/forgot-password', [
        body('email')
            .notEmpty().withMessage('Email is required.')
            .custom((value) => {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    throw new Error('Enter valid email address.');
                }
                return true;
            })
], authController.userRequestForgotPassword);

// ------------------------------------------------------------------------------------------------
// LOGOUT USER
// ------------------------------------------------------------------------------------------------
router.get('/logout', authController.userLogout);

// -----------------------------------------------------------------------------------------------
// RENDER VERIFY USER 
// -----------------------------------------------------------------------------------------------

router.get('/verify', (req, res) => {
    if (!req.session.userVerificationDraft) {
        req.session.message = 'Invalid password reset request!';
        req.session.messageType = 'error';
        return res.redirect('/auth/forgot-password');
    }

    return res.render('auth/verify', { 
        data: req.session.userVerificationDraft 
    });
});

// -----------------------------------------------------------------------------------------------
// VERIFY USER CODE
// -----------------------------------------------------------------------------------------------

router.post('/verify', authController.verifyUserCode);

// ----------------------------------------------------------------------------------------------
// RESET PASSWORD
// ----------------------------------------------------------------------------------------------

router.post('/reset-password', authController.resetPassword);

router.post('/change-password', authController.changeUserPassword);

// ===============================================================================================
// Shared app pages in app rendering
// ===============================================================================================
const allowedPages = ['login', 'register', 'forgot-password', 'verify', 'reset-password', 'change-password'];

router.get('/:page', (req, res) => {
    const page = req.params.page;

    if (!allowedPages.includes(page)) {
        return res.status(404).send('Page Not Found');
    }

    res.render(`auth/${page}`, {
        // message: req.session.message || null,
        // messageType: req.session.messageType || null,
        // values: {},
    });
});


module.exports = router;
