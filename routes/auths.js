const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authController = require('../controllers/authController');
const session = require('express-session');
// const auth = require('../middleware/authMiddleware');
const { body } = require('express-validator');
const secretKey = require('../generateKey');


// Handle registration form submission
// router.post('/register', [
//         body('firstName')
//             .isAlpha().withMessage('Invalide first name.')
//             .isLength({ min: 2 }).withMessage('First name too short'),
//         body('lastName')
//             .isAlpha().withMessage('Invalid last.')
//             .isLength({ min: 2 }).withMessage('Last name too short.'),
//         body('email')
//             .isEmail().withMessage('Enter a valid email address.'),
//         body('password')
//             .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
//         body('confirmPassword')
//             .custom((value, { req }) => value === req.body.password)
//             .withMessage('Passwords must match.')
//     ], authController.postRegister);


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

    // Clear messages after rendering
    // req.session.message = null;
    // req.session.messageType = null;
});


module.exports = router;
