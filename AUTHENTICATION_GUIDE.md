# Authentication Service Guide

Complete JWT-based authentication system with high-priority password reset emails.

## Overview

The authentication service provides:
- User registration with bcrypt password hashing
- JWT-based login and session management
- Forgot password with **HIGHEST PRIORITY** email queue
- Password reset with token verification
- Protected API routes
- Email notifications with priority levels

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│  - POST /api/auth/register                              │
│  - POST /api/auth/login                                 │
│  - POST /api/auth/forgot-password (Priority: 1)         │
│  - POST /api/auth/reset-password                        │
│  - GET  /api/auth/me (requires JWT)                     │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   MongoDB   │
                  │  (Users DB) │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │    Redis    │
                  │   (Queue)   │
                  └─────────────┘
                         │
                         ▼
                  ┌─────────────────────────────┐
                  │     Mail Queue Worker       │
                  │  Priority: 1 - Forgot pwd   │
                  │  Priority: 2 - Reset conf.  │
                  │  Priority: 3 - Registration │
                  └─────────────────────────────┘
```

## Email Queue Priorities

**Lower number = Higher priority**

| Priority | Email Type | Description | Retry Attempts |
|----------|------------|-------------|----------------|
| 1 | Forgot Password | Time-sensitive password reset | 5 |
| 2 | Password Reset Confirmation | Security notification | 3 |
| 3 | Registration Welcome | Welcome email | 3 |
| 5 | New Event | Event notifications | 3 |
| 5 | Reminder | Event reminders | 3 |

### Why Forgot Password is Priority 1

- **User is waiting** - They can't access their account
- **Time-sensitive** - Reset tokens expire in 1 hour
- **Security critical** - Delays could cause user frustration
- **Poor UX** - Users expect immediate email delivery

## API Endpoints

### 1. Register User

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securepassword123"
}
```

**Response (201 Created):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "createdAt": "2025-12-30T12:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**What Happens:**
1. Password is hashed with bcrypt (10 salt rounds)
2. User saved to MongoDB
3. JWT token generated (expires in 7 days)
4. Welcome email queued with **Priority: 3**

---

### 2. Login

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**What Happens:**
1. User found by email
2. Password verified with bcrypt
3. Login metadata updated (last login, login count)
4. JWT token generated

---

### 3. Forgot Password (HIGHEST PRIORITY)

**Endpoint:** `POST /api/auth/forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If an account exists with this email, a password reset link has been sent"
}
```

**What Happens:**
1. User found by email
2. Cryptographically secure reset token generated (32 bytes)
3. Token hashed and saved to database with 1-hour expiry
4. Email queued with **Priority: 1 (HIGHEST)**
5. Worker processes email immediately

**Email Priority Configuration:**
```javascript
mailQueue.add('forgot-password', {
  email: user.email,
  name: user.name,
  resetToken,
  userId: user._id.toString(),
  expiresAt: user.passwordResetExpires,
}, {
  priority: 1,        // HIGHEST PRIORITY
  attempts: 5,        // More retry attempts
  backoff: {
    type: 'exponential',
    delay: 1000       // Faster retry (1s, 2s, 4s, 8s, 16s)
  }
});
```

---

### 4. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Request Body:**
```json
{
  "token": "abc123def456...",
  "newPassword": "newsecurepassword456"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successful"
}
```

**What Happens:**
1. Token hashed and looked up in database
2. Token expiry checked (must be < 1 hour old)
3. Password updated and hashed
4. Reset token cleared from database
5. Confirmation email queued with **Priority: 2**

---

### 5. Get Current User Profile

**Endpoint:** `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "isEmailVerified": false,
    "metadata": {
      "lastLogin": "2025-12-30T12:00:00.000Z",
      "loginCount": 5,
      "registrationIP": "192.168.1.1"
    },
    "createdAt": "2025-12-30T10:00:00.000Z",
    "updatedAt": "2025-12-30T12:00:00.000Z"
  }
}
```

---

## Protected Routes

All payment endpoints now require authentication:

```javascript
// Before - No authentication
POST /api/payments

// After - Requires JWT token
POST /api/payments
Headers: Authorization: Bearer <token>
```

### Example: Making a Payment (Authenticated)

```bash
# 1. Login first
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'

# Save the token from response

# 2. Make payment with token
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "amount": 29.99,
    "currency": "USD",
    "description": "Premium subscription"
  }'
```

---

## Testing the Complete Flow

### 1. Start Services

```bash
docker-compose up -d
```

### 2. Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "password": "password123"
  }'
```

**Expected:**
- User created in MongoDB
- JWT token returned
- Welcome email queued (Priority: 3)

### 3. Request Password Reset

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Expected:**
- Reset token generated
- Email queued with **Priority: 1 (HIGHEST)**
- Worker processes immediately
- Email sent within seconds

### 4. Monitor Email Queue

```bash
# Check mail queue logs
docker-compose logs -f mail-queue

# Expected output:
# 🔥 Processing forgot-password job: 1 - Priority: 1 (HIGHEST)
# ✓ Email sent: <message-id>
# ✓ Job 1 completed successfully
```

### 5. Reset Password

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_RESET_TOKEN_FROM_EMAIL",
    "newPassword": "newpassword456"
  }'
```

**Expected:**
- Password updated
- Confirmation email queued (Priority: 2)

---

## Security Features

### Password Security
- **Bcrypt hashing** with 10 salt rounds
- **Minimum 6 characters** (configurable)
- **Automatic hashing** on user save
- **Never returned** in API responses

### Token Security
- **Cryptographically secure** random tokens (32 bytes)
- **Hashed before storage** (SHA-256)
- **1-hour expiry** for reset tokens
- **Single-use** tokens (cleared after reset)

### JWT Security
- **Secret key** from environment variable
- **7-day expiry** (configurable)
- **Verified on every request** to protected routes
- **User lookup** on each request

---

## Environment Variables

Add to your [.env](.env.example) file:

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Frontend URL (for reset links in emails)
FRONTEND_URL=http://localhost:3001

# Email Configuration (existing)
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourcompany.com
```

---

## Files Created

### API Layer
- [api/config/auth.js](api/config/auth.js) - JWT and bcrypt configuration
- [api/models/User.js](api/models/User.js) - User model with password hashing
- [api/middleware/auth.js](api/middleware/auth.js) - JWT authentication middleware
- [api/controllers/authController.js](api/controllers/authController.js) - Auth endpoints
- [api/routes/authRoutes.js](api/routes/authRoutes.js) - Auth routes

### Email Templates
- [mail-queue/templates/passwordResetConfirmation.js](mail-queue/templates/passwordResetConfirmation.js) - Reset confirmation template
- [mail-queue/processors/mailProcessor.js](mail-queue/processors/mailProcessor.js) - Updated with reset confirmation

### Configuration
- [docker-compose.yml](docker-compose.yml) - Updated with JWT env vars
- [.env.example](.env.example) - Updated with all auth variables

---

## Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│                    Registration Flow                        │
└────────────────────────────────────────────────────────────┘

User → POST /api/auth/register
     ↓
  Hash Password (bcrypt)
     ↓
  Save to MongoDB
     ↓
  Generate JWT Token
     ↓
  Queue Welcome Email (Priority: 3)
     ↓
  Return User + Token


┌────────────────────────────────────────────────────────────┐
│              Forgot Password Flow (Priority 1)              │
└────────────────────────────────────────────────────────────┘

User → POST /api/auth/forgot-password
     ↓
  Find User by Email
     ↓
  Generate Secure Token (32 bytes)
     ↓
  Hash Token (SHA-256)
     ↓
  Save Hashed Token to DB (1hr expiry)
     ↓
  Queue Email with PRIORITY: 1 🔥
     ↓
  Worker Processes IMMEDIATELY
     ↓
  Email Sent to User (< 5 seconds)
     ↓
  User Clicks Reset Link
     ↓
  POST /api/auth/reset-password
     ↓
  Verify Token & Expiry
     ↓
  Update Password
     ↓
  Clear Reset Token
     ↓
  Queue Confirmation Email (Priority: 2)


┌────────────────────────────────────────────────────────────┐
│                 Authenticated Payment Flow                  │
└────────────────────────────────────────────────────────────┘

User → POST /api/auth/login
     ↓
  Verify Password
     ↓
  Generate JWT Token
     ↓
  Return Token
     ↓
User → POST /api/payments (with JWT header)
     ↓
  Verify JWT Token
     ↓
  Attach User to Request
     ↓
  Process Payment
     ↓
  Queue Payment Job
```

---

## Next Steps

1. ✅ **Authentication Service** - Complete with JWT
2. ✅ **Password Reset** - High priority email queue
3. ✅ **Protected Routes** - Payments require auth
4. ✅ **Email Priorities** - Forgot password = Priority 1

### Recommended Additions

1. **Email Verification** - Verify email addresses on registration
2. **Two-Factor Authentication (2FA)** - Add extra security layer
3. **Refresh Tokens** - Long-lived sessions without exposing JWT
4. **Rate Limiting** - Prevent brute force attacks
5. **OAuth Integration** - Google, GitHub login
6. **Session Management** - Track active sessions
7. **Audit Logs** - Log all authentication events

---

## Troubleshooting

### Token Expired Error
```json
{
  "error": "Authentication failed",
  "message": "Token expired"
}
```
**Solution:** Login again to get a new token.

### Invalid Token Error
```json
{
  "error": "Authentication failed",
  "message": "Invalid token"
}
```
**Solution:** Check the Authorization header format: `Bearer <token>`

### Reset Token Expired
```json
{
  "error": "Password reset failed",
  "message": "Invalid or expired reset token"
}
```
**Solution:** Request a new password reset. Tokens expire after 1 hour.

---

## Support

For issues or questions:
- Check logs: `docker-compose logs -f api` or `docker-compose logs -f mail-queue`
- Verify environment variables are set
- Ensure MongoDB is running and connected
- Check Redis connection for queue functionality
