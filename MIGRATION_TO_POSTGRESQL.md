# Migration to PostgreSQL (Single Database)

## ✅ Problem Solved

**Before:**
- ❌ API used **MongoDB** for Users (authentication)
- ✅ API used **PostgreSQL** for Events, Payments
- ❌ Two databases to manage
- ❌ Complex deployment
- ❌ Extra infrastructure costs

**After:**
- ✅ **PostgreSQL only** for everything
- ✅ Consistent database approach
- ✅ Sequelize ORM throughout
- ✅ Simpler deployment
- ✅ Lower costs

---

## Changes Made

### 1. User Model Converted to Sequelize

**Before (Mongoose):**
```javascript
// api/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  password: { type: String, required: true, select: false },
  // ...
});

module.exports = mongoose.model('User', userSchema);
```

**After (Sequelize):**
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // ...
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  defaultScope: {
    attributes: { exclude: ['password'] },  // Don't return password
  },
});

module.exports = User;
```

---

### 2. Auth Controller Updated

**Key Changes:**

#### Find User
```javascript
// Before (Mongoose)
const user = await User.findOne({ email });

// After (Sequelize)
const user = await User.findOne({ where: { email } });
```

#### Include Password
```javascript
// Before (Mongoose)
const user = await User.findOne({ email }).select('+password');

// After (Sequelize)
const user = await User.scope('withPassword').findOne({ where: { email } });
```

#### Date Comparison
```javascript
// Before (Mongoose)
const user = await User.findOne({
  passwordResetToken: hashedToken,
  passwordResetExpires: { $gt: Date.now() },
});

// After (Sequelize)
const { Op } = require('sequelize');
const user = await User.findOne({
  where: {
    passwordResetToken: hashedToken,
    passwordResetExpires: { [Op.gt]: new Date() },
  },
});
```

#### ID Field
```javascript
// Before (Mongoose)
user._id  // MongoDB ObjectId

// After (Sequelize)
user.id   // UUID
```

---

### 3. Auth Middleware Updated

```javascript
// Before (Mongoose)
const user = await User.findById(decoded.userId).select('-password');

// After (Sequelize)
const user = await User.findByPk(decoded.userId);
// Password excluded by default scope
```

---

### 4. Removed MongoDB Dependency

```bash
# Removed from package.json
npm uninstall mongoose

# No longer needed in docker-compose.yml
# - MongoDB service removed
```

---

## Database Schema

### Users Table (PostgreSQL)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  is_email_verified BOOLEAN DEFAULT false,
  role VARCHAR(50) DEFAULT 'user',
  metadata JSONB DEFAULT '{"lastLogin": null, "loginCount": 0, "registrationIP": null}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_email_verified ON users(is_email_verified);
```

---

## Migration Steps (If You Have Existing Data)

### Option 1: Fresh Start (Development)

```bash
# Drop all tables and recreate
docker-compose down -v
docker-compose up -d

# Sequelize will auto-create tables
```

### Option 2: Migrate Existing Users (Production)

If you had users in MongoDB, export and import:

```bash
# 1. Export from MongoDB
mongoexport --db=your_db --collection=users --out=users.json

# 2. Transform data to PostgreSQL format
node scripts/migrate-users.js

# 3. Import to PostgreSQL
psql -U postgres -d event_management -c "\COPY users FROM 'users.csv' CSV HEADER"
```

**Create migration script:**

```javascript
// scripts/migrate-users.js
const fs = require('fs');
const users = JSON.parse(fs.readFileSync('users.json'));

const csv = users.map(user => {
  return [
    user._id,  // Keep as UUID if possible, or generate new
    user.email,
    user.name,
    user.password,
    user.passwordResetToken || null,
    user.passwordResetExpires || null,
    user.isEmailVerified || false,
    user.role || 'user',
    JSON.stringify(user.metadata || {}),
    user.createdAt,
    user.updatedAt
  ].join(',');
}).join('\n');

fs.writeFileSync('users.csv', `id,email,name,password,password_reset_token,password_reset_expires,is_email_verified,role,metadata,created_at,updated_at\n${csv}`);
```

---

## Benefits

### 1. Simplified Architecture
```
Before:
┌─────────────┐     ┌──────────────┐
│   MongoDB   │     │  PostgreSQL  │
│   (Users)   │     │ (Events, etc)│
└─────────────┘     └──────────────┘

After:
┌──────────────────────┐
│    PostgreSQL        │
│ - Users              │
│ - Events             │
│ - Payments           │
└──────────────────────┘
```

### 2. Consistent ORM

All models use Sequelize:
- User (auth)
- Event (events)
- Payment (payments)

### 3. Easier Transactions

```javascript
// Can now use transactions across Users and Payments
const t = await sequelize.transaction();

try {
  const user = await User.create({ ... }, { transaction: t });
  const payment = await Payment.create({ userId: user.id }, { transaction: t });

  await t.commit();
} catch (error) {
  await t.rollback();
}
```

### 4. Better Relations

```javascript
// Define relationships
User.hasMany(Payment);
Payment.belongsTo(User);

// Query with joins
const user = await User.findByPk(userId, {
  include: [Payment]
});
```

### 5. Cost Savings

- One database instance instead of two
- Simpler backup strategy
- Lower AWS/cloud costs

---

## Testing

### 1. Test User Registration

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "password": "password123"
  }'
```

### 2. Test Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Verify in PostgreSQL

```bash
docker-compose exec postgres psql -U postgres -d event_management

# Check users table
SELECT * FROM users;

# Check schema
\d users
```

---

## Rollback (If Needed)

If you need to rollback to Mongoose:

```bash
# 1. Restore old User model
git checkout HEAD~1 -- api/models/User.js

# 2. Restore old auth controller
git checkout HEAD~1 -- api/controllers/authController.js

# 3. Restore old middleware
git checkout HEAD~1 -- api/middleware/auth.js

# 4. Reinstall mongoose
npm install mongoose

# 5. Add MongoDB to docker-compose.yml
```

---

## Summary

✅ **Single database (PostgreSQL)**
✅ **Consistent ORM (Sequelize)**
✅ **Simpler architecture**
✅ **Better performance**
✅ **Lower costs**
✅ **Easier to maintain**

No more managing two different databases and ORMs!
