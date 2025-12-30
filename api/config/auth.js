require('dotenv').config();

module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    resetTokenExpiresIn: '1h', // Password reset tokens expire in 1 hour
  },
  bcrypt: {
    saltRounds: 10,
  },
  passwordReset: {
    tokenExpiryMinutes: 60, // 1 hour
  }
};
