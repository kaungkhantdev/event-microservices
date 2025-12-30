const { DataTypes} = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: {
        msg: 'Please provide a valid email',
      },
      notEmpty: {
        msg: 'Email is required',
      },
    },
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Name is required',
      },
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password is required',
      },
      len: {
        args: [6, 100],
        msg: 'Password must be at least 6 characters',
      },
    },
  },
  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'password_reset_token',
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'password_reset_expires',
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_email_verified',
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user',
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      lastLogin: null,
      loginCount: 0,
      registrationIP: null,
    },
  },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  defaultScope: {
    attributes: { exclude: ['password', 'password_reset_token', 'password_reset_expires'] },
  },
  scopes: {
    withPassword: {
      attributes: {},
    },
    withResetToken: {
      attributes: { include: ['password_reset_token', 'password_reset_expires'] },
    },
  },
  indexes: [
    {
      unique: true,
      fields: ['email'],
    },
    {
      fields: ['role'],
    },
    {
      fields: ['is_email_verified'],
    },
  ],
  hooks: {
    // Hash password before creating user
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    // Hash password before updating if changed
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
  },
});

// Instance Methods

/**
 * Compare provided password with stored hash
 * @param {string} candidatePassword - Plain text password to compare
 * @returns {Promise<boolean>}
 */
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate password reset token
 * @returns {string} Unhashed token to send via email
 */
User.prototype.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token before saving to database
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  return resetToken; // Return unhashed token to send via email
};

/**
 * Update login metadata (last login time and count)
 * @returns {Promise<User>}
 */
User.prototype.updateLoginMetadata = async function() {
  this.metadata = {
    ...this.metadata,
    lastLogin: new Date(),
    loginCount: (this.metadata.loginCount || 0) + 1,
  };
  await this.save();
  return this;
};

module.exports = User;
