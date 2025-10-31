const session = require('express-session');
const db = require('../config/db');
const timeAgo = require('../utils/timeAgo');

// ________________________________________________________________________________
// Customer notifications
// ________________________________________________________________________________
exports.getUserNotifications = async (req, res, next) => {
  
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.redirect('/auth/login');
    }
    const [user] = await db.query(`SELECT fullname FROM user_tbl WHERE user_id = ? LIMIT 1`, [userId]);

    const [unreadResult] = await db.query(
      `SELECT COUNT(*) AS unreadCount FROM notification_tbl 
       WHERE receiver_id = ? AND status = 'Unread' `, [userId]
    );

    const [latestNotifications] = await db.query(
      `SELECT note_id, note_title, note_content, note_time 
       FROM notification_tbl 
       WHERE receiver_id = ? AND status = 'Unread'
       ORDER BY note_time DESC 
       LIMIT 5`, [userId]
    );

    // Add "time ago" string to each notification
    const notificationsWithTimeAgo = latestNotifications.map(note => ({
      ...note,
      timeAgo: timeAgo(note.note_time),
    }));

    const user_name = (user[0].fullname || '').trim().split(' ')[0];


    res.locals.unreadCount = unreadResult[0].unreadCount;
    res.locals.latestNotifications = notificationsWithTimeAgo;
    res.locals.username = user_name;
    next();
  } catch (error) {
    console.error('Notification fetch error:', error);
    res.locals.unreadCount = 0;
    res.locals.latestNotifications = [];
    next();
  }
};
