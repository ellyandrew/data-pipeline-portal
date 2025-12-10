const mysql = require('mysql2/promise');

require('dotenv').config();

// Local
const db = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
  port: process.env.DATABASE_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Production
// function getSSLConfig() {
//     if (process.env.DB_SSL === "true") {
//         return {
//             rejectUnauthorized: false
//         };
//     }
//     return false;
// }

// const db = mysql.createPool({
//     host: process.env.DATABASE_HOST,
//     user: process.env.DATABASE_USER,
//     password: process.env.DATABASE_PASSWORD,
//     database: process.env.DATABASE,
//     port: process.env.DATABASE_PORT || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     ssl: getSSLConfig()
// });

module.exports = db;
