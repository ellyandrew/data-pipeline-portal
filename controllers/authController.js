const bcrypt = require('bcryptjs');
const db = require('../config/db');
const nodemailer = require('nodemailer');
const session = require('express-session');
const { validationResult } = require('express-validator');
const secretKey = require('../generateKey');
const { logActivity } = require('../utils/logger');
const crypto = require('crypto');

// ------------------------------------------------------------------------------------------------
// 1. REGISTER USER
// ------------------------------------------------------------------------------------------------
exports.registerUser= async (req, res) => {

    const { firstName, middleName, lastName, idNumber, membershipType, email, password } = req.body;

    if (!firstName || !lastName || !email || !membershipType || !idNumber || !password) {
      req.session.message = "All fields are required!";
      req.session.messageType = "error";
      req.session.values = req.body;
      return res.redirect("/auth/register");
    }

    const fullName = [firstName, middleName, lastName]
    .filter(name => name && name.trim() !== "")
    .join(" ");

    const currentTask = 'Registration';

    try {
        // Check if member exists
        const [userCheck] = await db.query(`SELECT * FROM user_tbl WHERE email = ? OR idNumber = ? LIMIT 1`, [email, idNumber]);

        if (userCheck.length > 0) {
          req.session.message = "A member with this Email Address or ID Number already exists!";
          req.session.messageType = "error";
          req.session.values = req.body;
          return res.redirect("/auth/register");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [addMember] = await db.execute(
          `INSERT INTO members_tbl (first_name, middle_name, last_name, email, membership_type, role)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [firstName, middleName || null, lastName, email, membershipType, "Member"]
        );

        const memberId = addMember.insertId;

        const [result] = await db.execute(`INSERT INTO user_tbl (member_id, fullname, email, idNumber, role, password, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [memberId, fullName, email, idNumber, 'Member', hashedPassword, 'Pending']);

        const insertId = result.insertId;
        
        // Generate a 6-digit token
        const tokenCode = Math.floor(100000 + Math.random() * 900000);

        // Nodemailer
        const transporter = nodemailer.createTransport({
            secure: true,
            host: 'smtp.gmail.com',
            port: 465,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Send email
        await transporter.sendMail({
            from: 'uhrturgroup@gmail.com',
            to: email,
            subject: '[Uthabiti Africa] Verify Email',
            html: `
                <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body {font-family: Arial, sans-serif;background-color: #f9f9f9;margin: 0;padding: 0;}
                            .container {max-width: 600px;margin: 20px auto;background: #f5f5f5;padding: 20px;border-radius: 8px;box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);}
                            .header {text-align: center;color: #ffffff;font-size: 20px;margin-bottom: 20px;background-color: #e12503;height: 50px;border-radius: 2px;padding: 20px;font-weight: bold;font-family: monospace;}
                            .code {font-size: 24px;color: #000;font-weight: bold;text-align: center;margin: 20px 0;}
                            .footer {text-align: center;font-size: 12px;color: #e12503;margin-top: 20px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">Email Verification</div>
                            <p>Dear Member,</p>
                            <p>We received your request to join Uthabiti Africa: To verify your email address, user the code below:</p>
                            <div class="code">${tokenCode}</div>
                            <p>If you did not request this, please ignore this email.</p>
                            <div class="footer">Thank you for using our service!</div>
                        </div>
                    </body>
                </html>
            `,
        });

        await db.execute(
            `INSERT INTO verification_tbl (user_id, email, verification_code, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
             ON DUPLICATE KEY UPDATE verification_code = VALUES(verification_code), expires_at = VALUES(expires_at)`,
            [insertId, email, tokenCode]
        );

        req.session.userVerificationDraft = { userId: insertId, userEmail: email, userTask: currentTask };
        req.session.message = 'Verification Code Sent! Please check your email.';
        req.session.messageType = 'success';
        return res.redirect('/auth/verify');

    } catch (error) {
        return res.render('auth/register', { message: 'Technical error occurred!', messageType: 'error', values: req.body });
    }
};

// ------------------------------------------------------------------------------------------------
// 2. LOGIN USER
// ------------------------------------------------------------------------------------------------

exports.loginUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', {
      message: errors.array()[0].msg,
      messageType: 'error',
    });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('auth/login', {
      message: 'All fields are required!',
      messageType: 'error',
    });
  }

  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.render('auth/login', {
        message: 'Invalid email address!',
        messageType: 'error',
      });
    }

    const [users] = await db.query('SELECT * FROM user_tbl WHERE email = ? LIMIT 1', [email]);

    const user = users[0];
    if (!user) {
      return res.render('auth/login', {
        message: 'Account not found!',
        messageType: 'error',
      });
    }

    if (['Blocked', 'Deleted', 'Suspended'].includes(user.status)) {
      return res.render('auth/login', {
        message: `Your account is ${user.status.toLowerCase()}. Please contact the administrator.`,
        messageType: 'error',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('auth/login', {
        message: 'Incorrect password!',
        messageType: 'error',
      });
    }

    if (user.status === 'Pending') {
      req.session.temp_user_id = { user_id: user.user_id };
      return res.redirect('/auth/change-password');
    }

    if (user.password_date) {
      const lastChanged = new Date(user.password_date);
      const now = new Date();
      const diffMonths =
        (now.getFullYear() - lastChanged.getFullYear()) * 12 +
        (now.getMonth() - lastChanged.getMonth());

      if (diffMonths >= 3) {
        req.session.temp_user_id = user.user_id;
        return res.render('auth/login', {
          message: 'Your password has expired (3 months). Please reset your password.',
          messageType: 'error',
        });
      }
    }

    if (user.status !== 'Active') {
      return res.render('auth/login', {
        message: 'Your account is not active!',
        messageType: 'error',
      });
    }
    
    req.session.userId = user.user_id;
    req.session.user_role = user.role;
    req.session.userMember = user.member_id || '';

    await db.execute(`UPDATE user_tbl SET last_login = NOW() WHERE user_id = ? LIMIT 1`, [user.user_id]);

    await logActivity(user.user_id, null, 'LOGIN', `User logged in.`, req);

    if (['Admin', 'Data Clerk', 'Viewer', 'Champion'].includes(user.role)) {
      return res.redirect('/portal/dashboard');
    } else if(['Member'].includes(user.role)) {
      return res.redirect('/member/my-dashboard');
    } else {
      return res.redirect('/');
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.render('auth/login', {
      message: 'Technical error occurred during login!',
      messageType: 'error',
    });
  }
};

// ------------------------------------------------------------------------------------------------
// 3. LOGOUT USER
// ------------------------------------------------------------------------------------------------

exports.userLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('An error occurred while logging out.');
        }

        // res.clearCookie('dukaSession');
        res.redirect('/auth/login');
    });
};

// -----------------------------------------------------------------------------------------------
// 4. USER REQUEST FORGOT PASSWORD
// -----------------------------------------------------------------------------------------------

exports.userRequestForgotPassword = async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('auth/forgot-password', {
            message: errors.array()[0].msg,
            messageType: 'error',
            values: req.body,
        });
    }

    const { email } = req.body;
    if (!email) {
        return res.render('auth/forgot-password', { 
            message: 'Email address is required!', 
            messageType: 'error', 
            values: req.body 
        });
    }

    const currentTask = 'Reset';

    try {
        let member;

        const [results] = await db.query(
            'SELECT user_id, email FROM user_tbl WHERE email = ? LIMIT 1', 
            [email]
        );

        member = results[0];

        if (!member) {
            req.session.message = 'Verification code sent! Check your email.';
            req.session.messageType = 'success';
            return res.redirect('/auth/verify');
        }

        // log activity
        await logActivity(member.user_id, null, "PASSWORD_RESET", `User forgot password.`, req);

        // Generate a 6-digit token
        const tokenCode = Math.floor(100000 + Math.random() * 900000);

        // Setup transporter
        const transporter = nodemailer.createTransport({
            secure: true,
            host: 'smtp.gmail.com',
            port: 465,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Send email
        await transporter.sendMail({
            from: 'uhrturgroup@gmail.com',
            to: email,
            subject: '[Uthabiti Africa] Reset password request',
            html: `
                <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body {font-family: Arial, sans-serif;background-color: #f9f9f9;margin: 0;padding: 0;}
                            .container {max-width: 600px;margin: 20px auto;background: #f5f5f5;padding: 20px;border-radius: 8px;box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);}
                            .header {text-align: center;color: #ffffff;font-size: 20px;margin-bottom: 20px;background-color: #e12503;height: 50px;border-radius: 2px;padding: 20px;font-weight: bold;font-family: monospace;}
                            .code {font-size: 24px;color: #000;font-weight: bold;text-align: center;margin: 20px 0;}
                            .footer {text-align: center;font-size: 12px;color: #e12503;margin-top: 20px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">Password Reset</div>
                            <p>Dear Member,</p>
                            <p>We received a request to update the password for Uthabiti Affrica: To reset your password, use the code below:</p>
                            <div class="code">${tokenCode}</div>
                            <p>If you did not request this, please ignore this email.</p>
                            <div class="footer">Thank you for using our service!</div>
                        </div>
                    </body>
                </html>
            `,
        });

        // Save token (with expiry handling)
        await db.execute(
            `INSERT INTO verification_tbl (user_id, email, verification_code, expires_at) 
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
             ON DUPLICATE KEY UPDATE 
                verification_code = VALUES(verification_code),
                expires_at = VALUES(expires_at)`,
            [member.user_id, email, tokenCode]
        );

        
        req.session.userVerificationDraft = { userId: member.user_id, userEmail: email, userTask: currentTask };
        req.session.message = 'Verification Code Sent! Please check your email.';
        req.session.messageType = 'success';
        return res.redirect('/auth/verify');

    } catch (error) {
        console.error('Forgot password error:', error);
        return res.render('auth/forgot-password', { 
            message: 'Technical error occurred!', 
            messageType: 'error', 
            values: req.body 
        });
    }
};

// ------------------------------------------------------------------------------------------------
// 5. VERIFY USER VERIFICATION CODE
// ------------------------------------------------------------------------------------------------

exports.verifyUserCode = async (req, res) => {
  if (!req.session.userVerificationDraft) {
    req.session.message = 'Invalid password reset request!';
    req.session.messageType = 'error';
    return res.redirect('/auth/forgot-password');
  }

  const { userId, userEmail, userTask } = req.session.userVerificationDraft;
  const { verificationCode } = req.body;

  if (!verificationCode) {
    req.session.message = 'Verification code is required!';
    req.session.messageType = 'error';
    return res.redirect('/auth/verify');
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM verification_tbl 
       WHERE user_id = ? AND email = ? AND verification_code = ? AND used = 0 AND expires_at > NOW() 
       LIMIT 1`,
      [userId, userEmail, verificationCode]
    );

    if (rows.length === 0) {
      await db.query(
        `UPDATE verification_tbl 
         SET attempts = attempts + 1 
         WHERE user_id = ? AND email = ? AND used = 0 
         ORDER BY id DESC LIMIT 1`,
        [userId, userEmail]
      );

      await logActivity(userId, null, "VERIFICATION_FAILED", `Invalid verification attempt for ${userEmail}`, req);

      req.session.message = 'Invalid or expired verification code!';
      req.session.messageType = 'error';
      return res.redirect('/auth/verify');
    }

    const tokenRow = rows[0];

    if (tokenRow.attempts >= 2) {
      await logActivity(userId, null, "VERIFICATION_BLOCKED", `User ${userEmail} exceeded verification attempts`, req);

      req.session.message = 'Too many invalid attempts. Please request a new code.';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    await db.query(
      `UPDATE verification_tbl 
       SET used = 1, verified_at = NOW() 
       WHERE id = ?`,
      [tokenRow.id]
    );

    req.session.isVerified = true;
    req.session.verifiedEmail = userEmail;
    req.session.verifiedUser = userId;

    await logActivity(userId, null, "VERIFICATION_SUCCESS", `Verified code for ${userEmail} (${userTask})`, req);

    if (userTask === 'Registration') {
      await db.query(`UPDATE user_tbl SET status = ? WHERE user_id = ? LIMIT 1`, ['Active', userId]);

      req.session.message = 'Email verified successfully! You can now log in.';
      req.session.messageType = 'success';
      return res.redirect('/auth/login');
    }

    if (userTask === 'Reset') {
      req.session.message = 'Code verified successfully! Change your password.';
      req.session.messageType = 'success';
      return res.redirect('/auth/reset-password');
    }

    req.session.message = 'Verification successful.';
    req.session.messageType = 'success';
    return res.redirect('/auth/login');

  } catch (error) {
    console.error('Verification error:', error);

    await logActivity(userId, null, "VERIFICATION_ERROR", `System error during code verification for ${userEmail}: ${error.message}`, req);

    req.session.message = 'Technical error occurred!';
    req.session.messageType = 'error';
    return res.redirect('/auth/verify');
  }
};

// ------------------------------------------------------------------------------------------------
// 6. RESET PASSWORD
// ------------------------------------------------------------------------------------------------

exports.resetPassword = async (req, res) => {

    if (!req.session.isVerified || !req.session.verifiedEmail || !req.session.verifiedUser) {
        req.session.message = 'Unauthorized password reset request!';
        req.session.messageType = 'error';
        return res.redirect('/auth/forgot-password');
    }

    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
        req.session.message = 'Both password fields are required!';
        req.session.messageType = 'error';
        return res.redirect('/auth/reset-password');
    }

    if (password !== confirmPassword) {
        req.session.message = 'Passwords do not match!';
        req.session.messageType = 'error';
        return res.redirect('/auth/reset-password');
    }

    try {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 12);

        await db.execute(
            `UPDATE user_tbl SET password = ? WHERE email = ? AND user_id = ? LIMIT 1`,
            [hashedPassword, req.session.verifiedEmail, req.session.verifiedUser]
        );

        // Clear session verification state
        delete req.session.isVerified;
        delete req.session.verifiedEmail;
        delete req.session.userVerificationDraft;
        delete req.session.verifiedUser;

        req.session.message = 'Password reset successful! Now log in.';
        req.session.messageType = 'success';
        return res.redirect('/auth/reset-password');

    } catch (error) {
        console.error('Reset password error:', error);
        req.session.message = 'Technical error occurred!';
        req.session.messageType = 'error';
        return res.redirect('/auth/reset-password');
    }
};

// -----------------------------------------------------------------------------------------------
//  7. CHANGE PASSWORD
// -----------------------------------------------------------------------------------------------
exports.changeUserPassword = async (req, res) => {

  if (!req.session.temp_user_id) {
        req.session.message = 'Unauthorized password change request!';
        req.session.messageType = 'error';
        return res.redirect('/auth/login');
    }

    const { user_id } = req.session.temp_user_id;

    const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.session.message = 'All fields are required!';
      req.session.messageType = 'error';
      return res.redirect('/auth/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.session.message = 'Passwords do not match!';
      req.session.messageType = 'error';
      return res.redirect('/auth/change-password');
    }

    if (newPassword.length < 8) {
      req.session.message = 'Password must be at least 8 characters long!';
      req.session.messageType = 'error';
      return res.redirect('/auth/change-password');
    }

    const [users] = await db.query(`SELECT password, idNumber, status FROM user_tbl WHERE user_id = ? LIMIT 1`, [user_id]);

    if (users.length === 0) {
      req.session.message = 'User not found!';
      req.session.messageType = 'error';
      return res.redirect('/auth/login');
    }

    const user = users[0];

    const validOldPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validOldPassword) {
      req.session.message = 'Old password is incorrect!';
      req.session.messageType = 'error';
      return res.redirect('/auth/change-password');
    }

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      req.session.message = 'New password must be different from the old one!';
      req.session.messageType = 'error';
      return res.redirect('/auth/change-password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.execute(`UPDATE user_tbl SET password = ?, password_date = NOW(), updated_at = NOW(), status = CASE WHEN status = 'Pending' THEN 'Active' ELSE status END
       WHERE user_id = ? 
       LIMIT 1`,
      [hashedPassword, user_id]
    );

    await logActivity(req.session.temp_user_id, null, 'USER_PASSWORD_RESET', `Password updated for user ID Number ${user.idNumber}`, req);

    req.session.message = 'Password changed successfully!';
    req.session.messageType = 'success';
    return res.redirect('/auth/change-password');
  } catch (err) {
    console.error('Error changing password:', err);
    req.session.message = 'Error changing password.';
    req.session.messageType = 'error';
    return res.redirect('/auth/login');
  }
};



