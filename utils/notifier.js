const db = require('../config/db');

exports.notifyActivity = async (senderId, receiverId, title, content, req) => {
  try {
    const note_status = 'Unread';
    
    await db.execute(
      `INSERT INTO notification_tbl (sender_id, receiver_id, note_title, note_content, status)
       VALUES (?, ?, ?, ?, ?)`,
      [senderId, receiverId, title, content, note_status]
    );
  } catch (err) {
    console.error("Failed to notify user activity:", err.message);
  }
};
