# Database Architecture - PostgreSQL Only

## ✅ Consistent Database Strategy

Your system now uses **PostgreSQL for everything** with **Sequelize ORM**.

---

## 🗄️ Database Structure

### Single PostgreSQL Database: `event_management`

```
event_management (PostgreSQL)
├── users            ← Authentication (JWT, passwords)
├── events           ← Event management
├── payments         ← Payment processing
└── (future tables)  ← Easy to add more
```

---

## 📊 Tables

### 1. **users** - Authentication & User Management

```sql
CREATE TABLE users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   VARCHAR(255) NOT NULL UNIQUE,
  name                    VARCHAR(255) NOT NULL,
  password                VARCHAR(255) NOT NULL,  -- bcrypt hashed
  password_reset_token    VARCHAR(255),
  password_reset_expires  TIMESTAMP,
  is_email_verified       BOOLEAN DEFAULT false,
  role                    VARCHAR(50) DEFAULT 'user',  -- ENUM: user, admin
  metadata                JSONB DEFAULT '{}',  -- { lastLogin, loginCount, registrationIP }
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_email_verified ON users(is_email_verified);
```

**Features:**
- UUID primary key (better for distributed systems)
- Email unique constraint
- Password hashed with bcrypt (10 rounds)
- Password reset tokens (hashed with SHA-256)
- JSONB metadata for flexible data
- Automatic timestamps (created_at, updated_at)

---

### 2. **events** - Event Management

```sql
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  location      VARCHAR(255),
  start_date    TIMESTAMP NOT NULL,
  end_date      TIMESTAMP NOT NULL,
  category      VARCHAR(255),
  organizer     VARCHAR(255),
  max_attendees INTEGER,
  status        VARCHAR(50) DEFAULT 'draft',  -- ENUM: draft, published, cancelled, completed
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_title ON events(title);
CREATE INDEX idx_events_start_date ON events(start_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_category ON events(category);
```

---

### 3. **payments** - Payment Processing

```sql
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),  -- Foreign key
  amount          DECIMAL(10, 2) NOT NULL,
  currency        VARCHAR(3) DEFAULT 'USD',
  status          VARCHAR(50) DEFAULT 'pending',  -- ENUM: pending, completed, failed, refunded
  transaction_id  VARCHAR(255),
  provider        VARCHAR(50),  -- stripe, paypal, mock
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
```

---

## 🔗 Relationships

```javascript
// Define in your models
User.hasMany(Payment, { foreignKey: 'userId' });
Payment.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Event, { foreignKey: 'organizerId' });
Event.belongsTo(User, { as: 'organizer', foreignKey: 'organizerId' });
```

**Query with relations:**
```javascript
// Get user with all payments
const user = await User.findByPk(userId, {
  include: [Payment]
});

// Get payment with user info
const payment = await Payment.findByPk(paymentId, {
  include: [User]
});
```

---

## 🎯 Why PostgreSQL Only?

### **Benefits:**

1. **Single Database** - One connection, one backup, one deploy
2. **ACID Transactions** - Atomic operations across users & payments
3. **Powerful Features** - JSONB, full-text search, advanced indexing
4. **Cost Effective** - No need for MongoDB + PostgreSQL
5. **Consistent ORM** - All models use Sequelize
6. **Better Performance** - Optimized queries, proper indexing

### **vs MongoDB + PostgreSQL:**

| Aspect | MongoDB + PostgreSQL | PostgreSQL Only |
|--------|---------------------|-----------------|
| Databases | 2 | 1 ✅ |
| ORMs | Mongoose + Sequelize | Sequelize ✅ |
| Transactions | Limited | Full ACID ✅ |
| Joins | Not possible | Native ✅ |
| Cost | 2x instances | 1x instance ✅ |
| Complexity | High | Low ✅ |

---

## 🔧 Sequelize Models

### User Model

```javascript
// api/models/User.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

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
  },
  // ... other fields
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  defaultScope: {
    attributes: { exclude: ['password'] },  // Security: never return password
  },
  scopes: {
    withPassword: { attributes: {} },  // Use when login
  },
});

module.exports = User;
```

---

## 🚀 Usage Examples

### 1. Create User (Registration)

```javascript
const user = await User.create({
  email: 'user@example.com',
  name: 'John Doe',
  password: 'password123',  // Auto-hashed by beforeCreate hook
  metadata: {
    registrationIP: req.ip,
    loginCount: 0,
  },
});
```

### 2. Find User (Login)

```javascript
// Find with password included
const user = await User.scope('withPassword').findOne({
  where: { email: 'user@example.com' }
});

// Verify password
const isValid = await user.comparePassword('password123');
```

### 3. Password Reset

```javascript
// Find user with reset token
const { Op } = require('sequelize');
const user = await User.scope('withResetToken').findOne({
  where: {
    passwordResetToken: hashedToken,
    passwordResetExpires: { [Op.gt]: new Date() },
  },
});

// Update password
user.password = 'newPassword123';  // Auto-hashed by beforeUpdate hook
await user.save();
```

### 4. Transactions

```javascript
const t = await sequelize.transaction();

try {
  // Create user
  const user = await User.create({
    email: 'user@example.com',
    name: 'John Doe',
    password: 'password123',
  }, { transaction: t });

  // Create payment
  const payment = await Payment.create({
    userId: user.id,
    amount: 29.99,
    currency: 'USD',
  }, { transaction: t });

  await t.commit();
} catch (error) {
  await t.rollback();
  throw error;
}
```

---

## 📊 Connection Pooling

```javascript
// api/config/database.js
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    pool: {
      max: 5,        // Maximum connections
      min: 0,        // Minimum connections
      acquire: 30000, // Max time to get connection (ms)
      idle: 10000,   // Max idle time before release (ms)
    },
  }
);
```

---

## 🔍 Querying

### Basic Queries

```javascript
// Find by primary key
const user = await User.findByPk(userId);

// Find one
const user = await User.findOne({ where: { email } });

// Find all
const users = await User.findAll({ where: { role: 'admin' } });

// Count
const count = await User.count({ where: { isEmailVerified: true } });
```

### Advanced Queries

```javascript
// With operators
const { Op } = require('sequelize');

const users = await User.findAll({
  where: {
    email: { [Op.like]: '%@example.com' },
    createdAt: { [Op.gt]: new Date('2024-01-01') },
  },
});

// With pagination
const users = await User.findAndCountAll({
  limit: 10,
  offset: 20,
  order: [['createdAt', 'DESC']],
});

// With relations
const user = await User.findByPk(userId, {
  include: [Payment, Event],
});
```

---

## 🛡️ Security Features

### 1. Password Hashing (Automatic)

```javascript
// In User model
hooks: {
  beforeCreate: async (user) => {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
  },
  beforeUpdate: async (user) => {
    if (user.changed('password')) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);
    }
  },
}
```

### 2. Password Never Returned (Default Scope)

```javascript
defaultScope: {
  attributes: { exclude: ['password', 'password_reset_token'] },
}
```

### 3. Password Reset Tokens (Hashed)

```javascript
User.prototype.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hash before saving
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
  
  return resetToken; // Return unhashed to send via email
};
```

---

## 📈 Scaling

### Vertical Scaling

```yaml
# docker-compose.yml
postgres:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
```

### Horizontal Scaling (Read Replicas)

```javascript
const sequelize = new Sequelize({
  replication: {
    read: [
      { host: 'read-replica-1.example.com', username: 'read', password: 'pass' },
      { host: 'read-replica-2.example.com', username: 'read', password: 'pass' },
    ],
    write: { host: 'primary.example.com', username: 'write', password: 'pass' },
  },
});
```

---

## 🔧 Maintenance

### Backups

```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres event_management > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres event_management < backup.sql
```

### Migrations

```bash
# Create migration
npx sequelize-cli migration:generate --name add-user-phone

# Run migrations
npx sequelize-cli db:migrate

# Rollback
npx sequelize-cli db:migrate:undo
```

---

## 📝 Summary

✅ **Single Database** - PostgreSQL for everything  
✅ **Consistent ORM** - Sequelize throughout  
✅ **Secure** - Passwords hashed, tokens encrypted  
✅ **Scalable** - Connection pooling, read replicas  
✅ **ACID Transactions** - Data integrity guaranteed  
✅ **Cost Effective** - One database instance  
✅ **Developer Friendly** - Same patterns everywhere  

**No more MongoDB!** Everything uses PostgreSQL + Sequelize.
