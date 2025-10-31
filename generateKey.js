const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const envPath = path.join(__dirname, '.env');

function generateSecretKey() {
  return crypto.randomBytes(32).toString('hex'); // Produces a 64-character key
}

function updateSecretKey() {
  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let envVars = {};

  // Read existing .env file
  if (fs.existsSync(envPath)) {
    const envData = fs.readFileSync(envPath, 'utf-8');
    envVars = Object.fromEntries(
      envData.split('\n').filter(Boolean).map(line => line.split('='))
    );
  }

  // Check if a key exists and matches today's date
  if (envVars.SECRET_KEY_DATE === currentDate) {
    console.log('Using existing secret key.');
    return envVars.SECRET_KEY;
  }

  // Generate a new key
  const newKey = generateSecretKey();

  // Update the environment variables
  envVars.SECRET_KEY = newKey;
  envVars.SECRET_KEY_DATE = currentDate;

  // Write the updated .env file
  const updatedEnvContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(envPath, updatedEnvContent, 'utf-8');

//   console.log('Generated and updated new secret key.');
  return newKey;
}

// Update or get the secret key
const secretKey = updateSecretKey();
module.exports = secretKey;
