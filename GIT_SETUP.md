# Git Setup Guide

Complete guide for setting up Git for this microservices project.

## Table of Contents
1. [Initial Setup](#initial-setup)
2. [.gitignore Files](#gitignore-files)
3. [Commit Strategy](#commit-strategy)
4. [Branch Strategy](#branch-strategy)
5. [Security Best Practices](#security-best-practices)

---

## Initial Setup

### 1. Initialize Git Repository

```bash
# If not already initialized
git init

# Set your identity
git config user.name "Your Name"
git config user.email "your.email@example.com"

# Set default branch name
git config init.defaultBranch main
```

### 2. Add Remote Repository

```bash
# Add GitHub remote
git remote add origin https://github.com/yourusername/your-repo.git

# Or GitLab
git remote add origin https://gitlab.com/yourusername/your-repo.git

# Or Bitbucket
git remote add origin https://bitbucket.org/yourusername/your-repo.git

# Verify remote
git remote -v
```

### 3. Initial Commit

```bash
# Stage all files
git add .

# Check what will be committed
git status

# Create initial commit
git commit -m "Initial commit: Microservices architecture with authentication and payment system"

# Push to remote
git push -u origin main
```

---

## .gitignore Files

### File Structure

```
system-design/
├── .gitignore              ← Root (covers entire project)
├── .gitattributes          ← Line ending configuration
├── .dockerignore           ← Docker build context
├── api/.gitignore          ← API service specific
├── mail-queue/.gitignore   ← Mail queue specific
├── payment-service/.gitignore ← Payment service specific
├── worker/.gitignore       ← Worker service specific
└── load-tests/.gitignore   ← Load tests specific
```

### What's Ignored

#### **NEVER committed (Security Critical):**
- ✅ `.env` files (contains secrets)
- ✅ `*.key`, `*.pem` (private keys)
- ✅ `credentials.json` (API keys)
- ✅ Payment provider configs
- ✅ SMTP passwords
- ✅ JWT secrets
- ✅ Database passwords

#### **NEVER committed (Build artifacts):**
- ✅ `node_modules/` (dependencies)
- ✅ `dist/`, `build/` (compiled code)
- ✅ `*.log` (log files)
- ✅ `coverage/` (test coverage)

#### **NEVER committed (Docker volumes):**
- ✅ `postgres_data/`
- ✅ `redis_data/`
- ✅ `elasticsearch_data/`

#### **COMMITTED (.env.example is safe):**
- ✅ `.env.example` (template, no secrets)
- ✅ Source code
- ✅ Configuration templates
- ✅ Documentation

---

## Commit Strategy

### Conventional Commits Format

Use [Conventional Commits](https://www.conventionalcommits.org/) for clear commit history:

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### **Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

#### **Examples:**

```bash
# New feature
git commit -m "feat(auth): add JWT authentication with bcrypt password hashing"

# Bug fix
git commit -m "fix(payment): resolve race condition in payment processing queue"

# Documentation
git commit -m "docs: add load testing guide with k6 examples"

# Refactoring
git commit -m "refactor(mail-queue): improve email priority handling logic"

# Performance
git commit -m "perf(api): add Redis caching for JWT token verification"

# Multiple files
git commit -m "feat(auth): implement forgot password flow with Priority 1 email

- Add forgot password endpoint
- Generate secure reset tokens
- Queue password reset emails with Priority 1
- Add password reset confirmation template
- Update mail queue worker to process Priority 1 first

Closes #123"
```

### Commit Best Practices

**DO:**
- ✅ Write clear, descriptive messages
- ✅ Keep commits atomic (one logical change)
- ✅ Commit often (small, incremental changes)
- ✅ Test before committing
- ✅ Use present tense ("add" not "added")
- ✅ Reference issue numbers

**DON'T:**
- ❌ Commit sensitive data
- ❌ Commit generated files
- ❌ Use vague messages like "fix stuff"
- ❌ Mix multiple unrelated changes
- ❌ Commit broken code

---

## Branch Strategy

### Git Flow Strategy

```
main (production)
  ├── develop (integration)
  │   ├── feature/user-authentication
  │   ├── feature/payment-integration
  │   ├── feature/email-priority-queue
  │   └── bugfix/jwt-expiry-issue
  └── hotfix/critical-security-patch
```

### Branch Naming Convention

```bash
# Features
git checkout -b feature/short-description
git checkout -b feature/forgot-password-flow
git checkout -b feature/payment-webhook

# Bug fixes
git checkout -b bugfix/short-description
git checkout -b bugfix/email-queue-stalled
git checkout -b bugfix/payment-timeout

# Hotfixes (critical production bugs)
git checkout -b hotfix/short-description
git checkout -b hotfix/security-vulnerability

# Refactoring
git checkout -b refactor/short-description
git checkout -b refactor/database-connection-pool

# Documentation
git checkout -b docs/short-description
git checkout -b docs/api-endpoints
```

### Workflow

#### **1. Create Feature Branch**
```bash
# Make sure you're on develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/forgot-password-flow

# Work on feature...
# Make commits...

# Push to remote
git push -u origin feature/forgot-password-flow
```

#### **2. Create Pull Request**
```bash
# Push latest changes
git push origin feature/forgot-password-flow

# Create PR on GitHub/GitLab/Bitbucket
# - Title: "feat(auth): implement forgot password flow"
# - Description: Detailed explanation
# - Assign reviewers
# - Link to issue
```

#### **3. Merge to Develop**
```bash
# After PR approval
git checkout develop
git pull origin develop
git merge --no-ff feature/forgot-password-flow
git push origin develop

# Delete feature branch
git branch -d feature/forgot-password-flow
git push origin --delete feature/forgot-password-flow
```

#### **4. Release to Main**
```bash
# When ready for production
git checkout main
git pull origin main
git merge --no-ff develop
git tag -a v1.0.0 -m "Release v1.0.0: Authentication and payment system"
git push origin main --tags
```

---

## Security Best Practices

### Pre-Commit Checklist

Before every commit, verify:

```bash
# 1. Check what will be committed
git status
git diff --cached

# 2. Search for potential secrets
git diff --cached | grep -i "password\|secret\|key\|token"

# 3. Verify .env is ignored
git status | grep -v ".env.example" | grep ".env"

# 4. Check for large files
git diff --cached --stat | grep -E "^[ ]*[0-9]+ files? changed"
```

### Accidentally Committed Secrets?

**If you committed secrets, act IMMEDIATELY:**

#### **Option 1: Remove from last commit (not yet pushed)**
```bash
# Edit the file to remove secret
vim .env

# Add to .gitignore if not already
echo ".env" >> .gitignore

# Amend the commit
git add .gitignore
git commit --amend --no-edit

# Force push (ONLY if not pushed to shared branch)
git push --force-with-lease
```

#### **Option 2: Remove from history (already pushed)**
```bash
# Use BFG Repo-Cleaner (recommended)
brew install bfg

# Remove file from history
bfg --delete-files .env

# Or replace secrets
bfg --replace-text passwords.txt

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (DANGER: requires team coordination)
git push --force
```

#### **Option 3: Rotate ALL compromised credentials**
```bash
# CRITICAL: Even if you remove from Git, assume secrets are compromised!

# 1. Generate new JWT secret
openssl rand -base64 32

# 2. Rotate database passwords
# Update postgres password in production

# 3. Regenerate API keys
# Stripe, PayPal, SMTP, etc.

# 4. Update all environments
# Staging, production, development
```

### Git Hooks for Security

Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Pre-commit hook to prevent committing secrets

# Check for common secret patterns
if git diff --cached --name-only | xargs grep -E "(password|secret|key|token).*=.*['\"][^'\"]{8,}['\"]" 2>/dev/null; then
    echo "❌ ERROR: Potential secret detected in staged files!"
    echo "Please remove secrets and use environment variables."
    exit 1
fi

# Check for .env files (except .env.example)
if git diff --cached --name-only | grep -E "^\.env$|\.env\..*$" | grep -v ".env.example" 2>/dev/null; then
    echo "❌ ERROR: Attempting to commit .env file!"
    echo "Only .env.example should be committed."
    exit 1
fi

# Check for large files (> 5MB)
if git diff --cached --name-only | xargs ls -l 2>/dev/null | awk '$5 > 5242880 {print $9}'; then
    echo "⚠️  WARNING: Large files detected (> 5MB)"
    echo "Consider using Git LFS for large files."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for debugging statements
if git diff --cached | grep -E "console\.log|debugger|TODO|FIXME" 2>/dev/null; then
    echo "⚠️  WARNING: Debug statements or TODOs detected"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

exit 0
```

**Make it executable:**
```bash
chmod +x .git/hooks/pre-commit
```

---

## Useful Git Commands

### Daily Workflow

```bash
# Check status
git status

# See changes
git diff

# Stage specific files
git add file1.js file2.js

# Stage all changes
git add .

# Commit with message
git commit -m "feat(api): add health check endpoint"

# Pull latest changes
git pull origin develop

# Push changes
git push origin feature/my-feature
```

### Branch Management

```bash
# List branches
git branch -a

# Switch branch
git checkout develop

# Create and switch
git checkout -b feature/new-feature

# Delete local branch
git branch -d feature/old-feature

# Delete remote branch
git push origin --delete feature/old-feature

# Rename current branch
git branch -m new-branch-name
```

### History and Logs

```bash
# View commit history
git log

# Pretty log
git log --oneline --graph --all --decorate

# See changes in last commit
git show

# See file history
git log --follow -- path/to/file.js

# Search commits
git log --grep="auth"

# See who changed what
git blame file.js
```

### Undoing Changes

```bash
# Discard unstaged changes
git checkout -- file.js

# Unstage file
git reset HEAD file.js

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Revert a commit (creates new commit)
git revert <commit-hash>
```

### Stashing

```bash
# Stash changes
git stash

# List stashes
git stash list

# Apply latest stash
git stash apply

# Apply specific stash
git stash apply stash@{1}

# Apply and remove stash
git stash pop

# Clear all stashes
git stash clear
```

---

## .env File Management

### Structure

```
# ✅ COMMITTED (safe template)
.env.example

# ❌ NEVER COMMIT (contains real secrets)
.env
.env.local
.env.development
.env.production
```

### Creating .env from Template

```bash
# Copy example file
cp .env.example .env

# Edit with real values
vim .env

# NEVER commit .env!
git status  # Should show .env as untracked (ignored)
```

### Sharing Configuration

**DO:**
```bash
# Update .env.example when adding new variables
echo "NEW_API_KEY=your-api-key-here" >> .env.example
git add .env.example
git commit -m "docs: add NEW_API_KEY to .env.example"
```

**DON'T:**
```bash
# NEVER commit actual secrets
echo "NEW_API_KEY=sk_live_abc123..." >> .env  # ❌ DANGER
git add .env  # ❌ NEVER DO THIS
```

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/ci.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Check for secrets
        run: |
          # Use gitleaks or similar
          docker run -v $(pwd):/path zricethezav/gitleaks:latest \
            detect --source="/path" --verbose
```

---

## Summary

✅ **Complete .gitignore setup** for all services
✅ **Security-focused** - prevents committing secrets
✅ **Conventional commits** for clear history
✅ **Git Flow strategy** for organized development
✅ **Pre-commit hooks** for automated checks
✅ **Best practices** documented

### Quick Start

```bash
# 1. Initialize repo
git init
git remote add origin <your-repo-url>

# 2. Create initial commit
git add .
git commit -m "Initial commit: Microservices system with auth and payments"
git push -u origin main

# 3. Create develop branch
git checkout -b develop
git push -u origin develop

# 4. Start feature work
git checkout -b feature/your-feature
# ... make changes ...
git commit -m "feat(scope): description"
git push -u origin feature/your-feature
# Create PR to develop
```

**Never commit secrets!** Always double-check before pushing.
