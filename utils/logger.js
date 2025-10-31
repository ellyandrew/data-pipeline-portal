const db = require('../config/db');

exports.logActivity = async (userId, memberId, action, description, req) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    await db.query(
      `INSERT INTO activity_logs_tbl (user_id, member_id, action, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, memberId, action, description, ip, userAgent]
    );
  } catch (err) {
    console.error("Failed to log activity:", err.message);
  }
};
