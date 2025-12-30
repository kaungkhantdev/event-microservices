const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { jwt: jwtConfig } = require('../config/auth');
const { mailQueue } = require('../queues');

/**
 * Generate JWT token for user
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );
};

/**
 * Register new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // Validate input
    if (!email || !name || !password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email, name, and password are required',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'Registration failed',
        message: 'Email already registered',
      });
    }

    // Create user
    const user = await User.create({
      email,
      name,
      password,
      metadata: {
        registrationIP: req.ip,
        loginCount: 0,
      },
    });

    // Generate JWT token
    const token = generateToken(user.id);

    // Queue welcome email with medium priority
    await mailQueue.add('registration', {
      email: user.email,
      name: user.name,
      userId: user.id,
      registrationDate: new Date(),
    }, {
      priority: 3, // Medium priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    // Return user data (without password)
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);

    // Sequelize validation error
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        message: error.errors.map(e => e.message).join(', '),
      });
    }

    // Sequelize unique constraint error
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'Validation error',
        message: 'Email already registered',
      });
    }

    res.status(500).json({
      error: 'Registration failed',
      message: error.message,
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email and password are required',
      });
    }

    // Find user and include password field using scope
    const user = await User.scope('withPassword').findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
      });
    }

    // Update login metadata
    await user.updateLoginMetadata();

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      error: 'Login failed',
      message: error.message,
    });
  }
};

/**
 * Forgot password - send reset email
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email is required',
      });
    }

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists for security
      return res.json({
        message: 'If an account exists with this email, a password reset link has been sent',
      });
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save();

    // Queue password reset email with HIGHEST PRIORITY
    await mailQueue.add('forgot-password', {
      email: user.email,
      name: user.name,
      resetToken,
      userId: user.id,
      expiresAt: user.passwordResetExpires,
    }, {
      priority: 1, // HIGHEST PRIORITY - user is waiting!
      attempts: 5, // More retry attempts for critical emails
      backoff: {
        type: 'exponential',
        delay: 1000, // Faster initial retry
      },
    });

    console.log(`🔐 Password reset requested for ${email} - Priority: 1 (HIGHEST)`);

    res.json({
      message: 'If an account exists with this email, a password reset link has been sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);

    res.status(500).json({
      error: 'Password reset request failed',
      message: error.message,
    });
  }
};

/**
 * Reset password with token
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Token and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password must be at least 6 characters',
      });
    }

    // Hash the token to match database
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid reset token using Sequelize
    const { Op } = require('sequelize');
    const user = await User.scope('withResetToken').findOne({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({
        error: 'Password reset failed',
        message: 'Invalid or expired reset token',
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    // Queue password reset confirmation email
    await mailQueue.add('password-reset-confirmation', {
      email: user.email,
      name: user.name,
      userId: user.id,
      resetDate: new Date(),
    }, {
      priority: 2, // High priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    res.json({
      message: 'Password reset successful',
    });
  } catch (error) {
    console.error('Reset password error:', error);

    res.status(500).json({
      error: 'Password reset failed',
      message: error.message,
    });
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
        metadata: req.user.metadata,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);

    res.status(500).json({
      error: 'Failed to get profile',
      message: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
};
