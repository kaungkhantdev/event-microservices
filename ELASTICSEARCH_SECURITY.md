# Elasticsearch Security Configuration

## Current Setup (Development)

Your Elasticsearch is running **without authentication**:

```yaml
# docker-compose.yml
elasticsearch:
  environment:
    - xpack.security.enabled=false  # ⚠️ NO SECURITY
```

**This is OK for development, but DANGEROUS for production.**

---

## Production Setup (With Authentication)

### Step 1: Enable Security in Elasticsearch

Update [docker-compose.yml](docker-compose.yml:34-50):

```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
  container_name: event_elasticsearch
  environment:
    - discovery.type=single-node
    - xpack.security.enabled=true  # ✅ ENABLE SECURITY
    - ELASTIC_PASSWORD=your_secure_password_here  # Set elastic user password
    - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
  ports:
    - "9200:9200"
    - "9300:9300"
  volumes:
    - elasticsearch_data:/usr/share/elasticsearch/data
  healthcheck:
    test: ["CMD-SHELL", "curl -u elastic:your_secure_password_here -f http://localhost:9200/_cluster/health || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 5
```

---

### Step 2: Add Credentials to API Service

Update [docker-compose.yml](docker-compose.yml:52-81) API environment:

```yaml
api:
  environment:
    - NODE_ENV=development
    - PORT=3000
    # ... other vars ...
    - ELASTICSEARCH_NODE=http://elasticsearch:9200
    - ELASTICSEARCH_INDEX=events
    - ELASTICSEARCH_USERNAME=elastic          # ✅ ADD THIS
    - ELASTICSEARCH_PASSWORD=your_secure_password_here  # ✅ ADD THIS
```

---

### Step 3: Add Credentials to Worker Service

Update worker service environment:

```yaml
worker:
  environment:
    - NODE_ENV=development
    # ... other vars ...
    - ELASTICSEARCH_NODE=http://elasticsearch:9200
    - ELASTICSEARCH_INDEX=events
    - ELASTICSEARCH_USERNAME=elastic          # ✅ ADD THIS
    - ELASTICSEARCH_PASSWORD=your_secure_password_here  # ✅ ADD THIS
```

---

### Step 4: Use Environment Variables File

**Better approach:** Create a `.env` file for sensitive credentials:

```bash
# .env
ELASTICSEARCH_PASSWORD=your_secure_password_here
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_email_password
EMAIL_FROM=noreply@yourdomain.com
```

**Update docker-compose.yml:**

```yaml
api:
  env_file:
    - .env
  environment:
    - ELASTICSEARCH_USERNAME=elastic
    - ELASTICSEARCH_PASSWORD=${ELASTICSEARCH_PASSWORD}
```

**Add to .gitignore:**
```bash
echo ".env" >> .gitignore
```

---

## Current Code Already Supports It!

Your [api/config/elasticsearch.js](api/config/elasticsearch.js:6-11) already handles this:

```javascript
const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
    ? {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
      }
    : undefined,  // ✅ No auth if credentials not provided
});
```

**This means:**
- ✅ If you provide `ELASTICSEARCH_USERNAME` and `ELASTICSEARCH_PASSWORD` → uses authentication
- ✅ If you don't provide them → connects without authentication (current setup)

---

## Recommendation

### For Development (Current)
```yaml
# Keep it simple - no authentication needed
elasticsearch:
  environment:
    - xpack.security.enabled=false
```

**API environment:**
```yaml
api:
  environment:
    - ELASTICSEARCH_NODE=http://elasticsearch:9200
    - ELASTICSEARCH_INDEX=events
    # No credentials needed
```

---

### For Production
```yaml
# Enable security
elasticsearch:
  environment:
    - xpack.security.enabled=true
    - ELASTIC_PASSWORD=${ELASTICSEARCH_PASSWORD}
```

**API environment:**
```yaml
api:
  environment:
    - ELASTICSEARCH_NODE=http://elasticsearch:9200
    - ELASTICSEARCH_INDEX=events
    - ELASTICSEARCH_USERNAME=elastic
    - ELASTICSEARCH_PASSWORD=${ELASTICSEARCH_PASSWORD}
```

---

## Security Checklist

### Development (Current)
- ✅ No authentication (fast, easy)
- ✅ Running on localhost only
- ⚠️ Don't expose port 9200 publicly

### Production
- ✅ Enable `xpack.security.enabled=true`
- ✅ Set strong password for `elastic` user
- ✅ Create separate application user (not elastic superuser)
- ✅ Use HTTPS (TLS/SSL) instead of HTTP
- ✅ Restrict network access (firewall rules)
- ✅ Store credentials in secrets manager (AWS Secrets, Vault, etc.)
- ✅ Enable audit logging
- ✅ Regular security updates

---

## Creating Application User (Production Best Practice)

Instead of using the `elastic` superuser, create a dedicated app user:

```bash
# Connect to Elasticsearch container
docker exec -it event_elasticsearch bash

# Create application user with limited permissions
curl -X POST "localhost:9200/_security/user/event_app_user" \
  -u elastic:your_password \
  -H "Content-Type: application/json" \
  -d '{
    "password": "app_user_password",
    "roles": ["events_index_role"],
    "full_name": "Event Application User"
  }'

# Create role with specific permissions
curl -X POST "localhost:9200/_security/role/events_index_role" \
  -u elastic:your_password \
  -H "Content-Type: application/json" \
  -d '{
    "indices": [{
      "names": ["events"],
      "privileges": ["read", "write", "create_index", "manage"]
    }]
  }'
```

**Then use in your app:**
```yaml
- ELASTICSEARCH_USERNAME=event_app_user
- ELASTICSEARCH_PASSWORD=app_user_password
```

---

## Summary

**Current Status:** ✅ Your code is ready for both scenarios

**Development:** No credentials needed (security disabled)

**Production:** Just add these environment variables:
```yaml
- ELASTICSEARCH_USERNAME=elastic
- ELASTICSEARCH_PASSWORD=your_secure_password
```

Your Elasticsearch client will automatically use them! No code changes needed.
