const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'user_id',
    validate: {
      notEmpty: true
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0.01,
      isDecimal: true
    }
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD',
    validate: {
      isUppercase: true,
      len: [3, 3]
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded'),
    defaultValue: 'pending',
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  idempotencyKey: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'idempotency_key',
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'transaction_id',
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'mock',
  },
  jobId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'job_id',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message',
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'processed_at',
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at',
  },
}, {
  tableName: 'payments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['idempotency_key'],
      unique: true,
      where: {
        idempotency_key: {
          [DataTypes.Op.ne]: null
        }
      }
    },
    {
      fields: ['transaction_id'],
      unique: true,
      where: {
        transaction_id: {
          [DataTypes.Op.ne]: null
        }
      }
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Payment;
