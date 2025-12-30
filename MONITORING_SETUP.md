# Monitoring Setup Guide - Track Critical Metrics

## 🎯 Immediate Monitoring Priorities

Based on the growth analysis, you need to monitor these 4 critical metrics **immediately**:

1. **Search Query Volume** - Predicts when to scale Elasticsearch
2. **Database Query Latency** - Identifies performance bottlenecks
3. **API Response Times** - Measures user experience
4. **Connection Pool Usage** - Prevents connection exhaustion

---

## 📊 Quick Setup (15 Minutes)

### Option 1: Simple Logging (Start Here)
Add basic monitoring with just console logs and log analysis.

### Option 2: Production Monitoring (Recommended)
Use Prometheus + Grafana for real-time dashboards.

---

## 🚀 Implementation

### 1. Search Query Volume Monitoring

#### A. Add Search Metrics Middleware

Create `api/middleware/searchMetrics.js`:

```javascript
const redis = require('../config/redis');

const searchMetrics = async (req, res, next) => {
  const startTime = Date.now();

  // Intercept response to measure duration
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;

    // Log metrics
    logSearchMetrics({
      timestamp: new Date().toISOString(),
      query: req.query.q || '',
      filters: {
        status: req.query.status,
        category: req.query.category,
        location: req.query.location,
      },
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      duration,
      resultCount: data.pagination?.total || 0,
      endpoint: req.path,
    });

    return originalJson.call(this, data);
  };

  next();
};

const logSearchMetrics = async (metrics) => {
  // 1. Console log (immediate visibility)
  console.log(`[SEARCH] ${metrics.query || 'empty'} | ${metrics.duration}ms | ${metrics.resultCount} results`);

  // 2. Increment counters in Redis
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = new Date().getHours();

  try {
    await Promise.all([
      // Daily counters
      redis.incr(`search:count:${today}`),
      redis.incr(`search:count:${today}:hour:${hour}`),

      // Endpoint-specific counters
      redis.incr(`search:endpoint:${metrics.endpoint}:${today}`),

      // Track slow searches (>500ms)
      metrics.duration > 500 && redis.incr(`search:slow:${today}`),

      // Track empty results
      metrics.resultCount === 0 && redis.incr(`search:empty:${today}`),

      // Store recent searches (last 100)
      redis.lpush('search:recent', JSON.stringify(metrics)),
      redis.ltrim('search:recent', 0, 99),

      // Aggregate duration for average calculation
      redis.incrby(`search:duration:${today}`, metrics.duration),
    ]);

    // Set expiration (30 days)
    await redis.expire(`search:count:${today}`, 30 * 24 * 60 * 60);
  } catch (error) {
    console.error('Failed to log search metrics:', error.message);
  }
};

module.exports = searchMetrics;
```

#### B. Apply to Search Routes

Update `api/routes/searchRoutes.js`:

```javascript
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const cacheMiddleware = require('../middleware/cache');
const searchMetrics = require('../middleware/searchMetrics'); // ← Add this

// Apply metrics middleware to all search routes
router.use(searchMetrics); // ← Add this

router.get('/', cacheMiddleware({ expiration: 180 }), searchController.searchEvents);
router.get('/suggest', cacheMiddleware({ expiration: 300 }), searchController.autocomplete);
router.get('/aggregations', cacheMiddleware({ expiration: 600 }), searchController.getAggregations);

module.exports = router;
```

#### C. Add Search Metrics Endpoint

Add to `api/routes/searchRoutes.js`:

```javascript
// Get search metrics
router.get('/metrics', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const redis = require('../config/redis');

    const [
      totalToday,
      slowToday,
      emptyToday,
      durationToday,
      recentSearches,
    ] = await Promise.all([
      redis.get(`search:count:${today}`),
      redis.get(`search:slow:${today}`),
      redis.get(`search:empty:${today}`),
      redis.get(`search:duration:${today}`),
      redis.lrange('search:recent', 0, 9), // Last 10 searches
    ]);

    const total = parseInt(totalToday) || 0;
    const slow = parseInt(slowToday) || 0;
    const empty = parseInt(emptyToday) || 0;
    const totalDuration = parseInt(durationToday) || 0;

    // Get hourly breakdown
    const hourlyData = await Promise.all(
      Array.from({ length: 24 }, async (_, hour) => {
        const count = await redis.get(`search:count:${today}:hour:${hour}`);
        return {
          hour,
          count: parseInt(count) || 0,
        };
      })
    );

    res.json({
      date: today,
      summary: {
        total,
        slow,
        empty,
        averageDuration: total > 0 ? Math.round(totalDuration / total) : 0,
        slowPercentage: total > 0 ? ((slow / total) * 100).toFixed(2) : 0,
        emptyPercentage: total > 0 ? ((empty / total) * 100).toFixed(2) : 0,
      },
      hourly: hourlyData,
      recent: recentSearches.map(s => JSON.parse(s)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### D. View Search Metrics

```bash
# In browser or cURL
curl http://localhost:3000/api/search/metrics

# Response:
{
  "date": "2024-01-15",
  "summary": {
    "total": 1523,
    "slow": 45,
    "empty": 123,
    "averageDuration": 78,
    "slowPercentage": "2.95",
    "emptyPercentage": "8.08"
  },
  "hourly": [
    { "hour": 0, "count": 12 },
    { "hour": 1, "count": 8 },
    { "hour": 9, "count": 234 }, // Peak hour
    ...
  ],
  "recent": [
    {
      "timestamp": "2024-01-15T14:23:45.000Z",
      "query": "tech conference",
      "duration": 67,
      "resultCount": 42
    },
    ...
  ]
}
```

---

### 2. Database Query Latency Monitoring

#### A. Add Database Query Logger

Create `api/middleware/dbMetrics.js`:

```javascript
const { Sequelize } = require('sequelize');

let queryStats = {
  total: 0,
  slow: 0,
  errors: 0,
  totalDuration: 0,
  queries: [],
};

// Reset stats every hour
setInterval(() => {
  if (queryStats.total > 0) {
    console.log('\n=== DATABASE HOURLY STATS ===');
    console.log(`Total Queries: ${queryStats.total}`);
    console.log(`Slow Queries (>100ms): ${queryStats.slow} (${((queryStats.slow/queryStats.total)*100).toFixed(2)}%)`);
    console.log(`Average Duration: ${(queryStats.totalDuration/queryStats.total).toFixed(2)}ms`);
    console.log(`Errors: ${queryStats.errors}`);
    console.log('=============================\n');
  }

  queryStats = {
    total: 0,
    slow: 0,
    errors: 0,
    totalDuration: 0,
    queries: [],
  };
}, 60 * 60 * 1000); // Every hour

const setupDatabaseMonitoring = (sequelize) => {
  // Hook into Sequelize query logging
  sequelize.addHook('beforeQuery', (options) => {
    options.startTime = Date.now();
  });

  sequelize.addHook('afterQuery', (options, queryInfo) => {
    const duration = Date.now() - options.startTime;

    queryStats.total++;
    queryStats.totalDuration += duration;

    // Track slow queries (>100ms)
    if (duration > 100) {
      queryStats.slow++;

      console.warn(`[DB SLOW] ${duration}ms - ${queryInfo.sql.substring(0, 100)}...`);

      // Keep last 10 slow queries
      queryStats.queries.unshift({
        sql: queryInfo.sql,
        duration,
        timestamp: new Date().toISOString(),
      });
      queryStats.queries = queryStats.queries.slice(0, 10);
    }

    // Log every query in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] ${duration}ms - ${queryInfo.sql.substring(0, 80)}...`);
    }
  });

  // Track query errors
  sequelize.addHook('afterQuery', (options, queryInfo) => {
    if (queryInfo.error) {
      queryStats.errors++;
      console.error(`[DB ERROR] ${queryInfo.error.message}`);
    }
  });
};

const getQueryStats = () => queryStats;

module.exports = { setupDatabaseMonitoring, getQueryStats };
```

#### B. Enable in Database Config

Update `api/config/database.js`:

```javascript
const { Sequelize } = require('sequelize');
const { setupDatabaseMonitoring } = require('../middleware/dbMetrics');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      acquire: 60000,
      idle: 10000,
    },
  }
);

// ← Add monitoring
setupDatabaseMonitoring(sequelize);

module.exports = { sequelize };
```

#### C. Add Connection Pool Monitoring

Update `api/config/database.js`:

```javascript
// Monitor connection pool every 30 seconds
setInterval(() => {
  const pool = sequelize.connectionManager.pool;

  const stats = {
    size: pool.size,
    available: pool.available,
    using: pool.using,
    waiting: pool.waiting,
  };

  const usage = ((stats.using / stats.size) * 100).toFixed(2);

  console.log(`[DB POOL] ${stats.using}/${stats.size} (${usage}%) | Available: ${stats.available} | Waiting: ${stats.waiting}`);

  // Alert if pool is >80% used
  if (usage > 80) {
    console.warn(`⚠️  WARNING: Database connection pool usage is HIGH (${usage}%)`);
  }

  // Alert if queries are waiting
  if (stats.waiting > 0) {
    console.error(`🚨 CRITICAL: ${stats.waiting} queries waiting for connections!`);
  }
}, 30000);
```

#### D. Add Database Metrics Endpoint

Add to `api/server.js`:

```javascript
const { getQueryStats } = require('./middleware/dbMetrics');
const { sequelize } = require('./config/database');

app.get('/api/metrics/database', (req, res) => {
  const pool = sequelize.connectionManager.pool;
  const queryStats = getQueryStats();

  res.json({
    timestamp: new Date().toISOString(),
    connectionPool: {
      size: pool.size,
      available: pool.available,
      using: pool.using,
      waiting: pool.waiting,
      usagePercentage: ((pool.using / pool.size) * 100).toFixed(2),
    },
    queries: {
      total: queryStats.total,
      slow: queryStats.slow,
      errors: queryStats.errors,
      averageDuration: queryStats.total > 0
        ? (queryStats.totalDuration / queryStats.total).toFixed(2)
        : 0,
      slowPercentage: queryStats.total > 0
        ? ((queryStats.slow / queryStats.total) * 100).toFixed(2)
        : 0,
    },
    recentSlowQueries: queryStats.queries,
  });
});
```

---

### 3. API Response Time Monitoring

#### A. Add Response Time Middleware

Create `api/middleware/responseTime.js`:

```javascript
const redis = require('../config/redis');

const responseTimeMetrics = (req, res, next) => {
  const startTime = Date.now();

  // Intercept response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;

    // Log metrics
    logResponseTime({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
    });

    return originalSend.call(this, data);
  };

  next();
};

const logResponseTime = async (metrics) => {
  const { method, path, statusCode, duration } = metrics;

  // Color-coded console logging
  const color = duration < 50 ? '✓' : duration < 200 ? '⚡' : '⚠️';
  console.log(`${color} ${method} ${path} - ${statusCode} - ${duration}ms`);

  // Track in Redis
  const today = new Date().toISOString().split('T')[0];
  const endpoint = `${method}:${path}`;

  try {
    await Promise.all([
      // Count total requests
      redis.incr(`api:requests:${today}`),

      // Count by endpoint
      redis.incr(`api:endpoint:${endpoint}:${today}`),

      // Count by status code
      redis.incr(`api:status:${statusCode}:${today}`),

      // Track slow requests (>200ms)
      duration > 200 && redis.incr(`api:slow:${today}`),

      // Track errors (5xx)
      statusCode >= 500 && redis.incr(`api:errors:${today}`),

      // Aggregate duration
      redis.incrby(`api:duration:${today}`, duration),

      // Store recent slow requests
      duration > 200 && redis.lpush('api:slow:recent', JSON.stringify(metrics)),
      duration > 200 && redis.ltrim('api:slow:recent', 0, 49),
    ]);

    // Set expiration
    await redis.expire(`api:requests:${today}`, 30 * 24 * 60 * 60);
  } catch (error) {
    console.error('Failed to log response time:', error.message);
  }
};

module.exports = responseTimeMetrics;
```

#### B. Apply Globally

Update `api/server.js`:

```javascript
const responseTimeMetrics = require('./middleware/responseTime');

// Apply to all routes
app.use(responseTimeMetrics); // ← Add before routes

// Your routes
app.use('/api/events', eventRoutes);
app.use('/api/search', searchRoutes);
```

#### C. Add API Metrics Endpoint

Add to `api/server.js`:

```javascript
app.get('/api/metrics/api', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      totalRequests,
      slowRequests,
      errors,
      totalDuration,
      status200,
      status404,
      status500,
      recentSlow,
    ] = await Promise.all([
      redis.get(`api:requests:${today}`),
      redis.get(`api:slow:${today}`),
      redis.get(`api:errors:${today}`),
      redis.get(`api:duration:${today}`),
      redis.get(`api:status:200:${today}`),
      redis.get(`api:status:404:${today}`),
      redis.get(`api:status:500:${today}`),
      redis.lrange('api:slow:recent', 0, 9),
    ]);

    const total = parseInt(totalRequests) || 0;
    const slow = parseInt(slowRequests) || 0;
    const err = parseInt(errors) || 0;
    const duration = parseInt(totalDuration) || 0;

    res.json({
      date: today,
      summary: {
        total,
        slow,
        errors: err,
        averageDuration: total > 0 ? Math.round(duration / total) : 0,
        slowPercentage: total > 0 ? ((slow / total) * 100).toFixed(2) : 0,
        errorRate: total > 0 ? ((err / total) * 100).toFixed(2) : 0,
      },
      statusCodes: {
        200: parseInt(status200) || 0,
        404: parseInt(status404) || 0,
        500: parseInt(status500) || 0,
      },
      recentSlowRequests: recentSlow.map(r => JSON.parse(r)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

### 4. Unified Metrics Dashboard Endpoint

Create `api/routes/metricsRoutes.js`:

```javascript
const express = require('express');
const router = express.Router();
const redis = require('../config/redis');
const { sequelize } = require('../config/database');
const { getQueryStats } = require('../middleware/dbMetrics');

// Unified metrics dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Gather all metrics
    const [
      searchTotal,
      searchSlow,
      apiTotal,
      apiSlow,
      apiErrors,
    ] = await Promise.all([
      redis.get(`search:count:${today}`),
      redis.get(`search:slow:${today}`),
      redis.get(`api:requests:${today}`),
      redis.get(`api:slow:${today}`),
      redis.get(`api:errors:${today}`),
    ]);

    const pool = sequelize.connectionManager.pool;
    const queryStats = getQueryStats();

    res.json({
      timestamp: new Date().toISOString(),
      date: today,

      search: {
        total: parseInt(searchTotal) || 0,
        slow: parseInt(searchSlow) || 0,
        slowPercentage: searchTotal > 0
          ? ((parseInt(searchSlow) / parseInt(searchTotal)) * 100).toFixed(2)
          : 0,
      },

      api: {
        total: parseInt(apiTotal) || 0,
        slow: parseInt(apiSlow) || 0,
        errors: parseInt(apiErrors) || 0,
        slowPercentage: apiTotal > 0
          ? ((parseInt(apiSlow) / parseInt(apiTotal)) * 100).toFixed(2)
          : 0,
        errorRate: apiTotal > 0
          ? ((parseInt(apiErrors) / parseInt(apiTotal)) * 100).toFixed(2)
          : 0,
      },

      database: {
        connectionPool: {
          size: pool.size,
          using: pool.using,
          available: pool.available,
          waiting: pool.waiting,
          usagePercentage: ((pool.using / pool.size) * 100).toFixed(2),
        },
        queries: {
          total: queryStats.total,
          slow: queryStats.slow,
          errors: queryStats.errors,
          averageDuration: queryStats.total > 0
            ? (queryStats.totalDuration / queryStats.total).toFixed(2)
            : 0,
        },
      },

      alerts: generateAlerts({
        pool,
        queryStats,
        searchSlow: parseInt(searchSlow) || 0,
        searchTotal: parseInt(searchTotal) || 0,
        apiErrors: parseInt(apiErrors) || 0,
        apiTotal: parseInt(apiTotal) || 0,
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generateAlerts(data) {
  const alerts = [];

  // Connection pool alerts
  const poolUsage = (data.pool.using / data.pool.size) * 100;
  if (poolUsage > 80) {
    alerts.push({
      level: 'warning',
      type: 'connection_pool',
      message: `Connection pool usage is HIGH (${poolUsage.toFixed(2)}%)`,
    });
  }
  if (data.pool.waiting > 0) {
    alerts.push({
      level: 'critical',
      type: 'connection_pool',
      message: `${data.pool.waiting} queries waiting for connections`,
    });
  }

  // Slow query alerts
  const slowQueryPercent = data.queryStats.total > 0
    ? (data.queryStats.slow / data.queryStats.total) * 100
    : 0;
  if (slowQueryPercent > 10) {
    alerts.push({
      level: 'warning',
      type: 'database',
      message: `${slowQueryPercent.toFixed(2)}% of queries are slow (>100ms)`,
    });
  }

  // Search performance alerts
  const searchSlowPercent = data.searchTotal > 0
    ? (data.searchSlow / data.searchTotal) * 100
    : 0;
  if (searchSlowPercent > 5) {
    alerts.push({
      level: 'warning',
      type: 'search',
      message: `${searchSlowPercent.toFixed(2)}% of searches are slow (>500ms)`,
    });
  }

  // API error rate alerts
  const errorRate = data.apiTotal > 0
    ? (data.apiErrors / data.apiTotal) * 100
    : 0;
  if (errorRate > 1) {
    alerts.push({
      level: 'critical',
      type: 'api',
      message: `API error rate is ${errorRate.toFixed(2)}%`,
    });
  }

  return alerts;
}

module.exports = router;
```

Add to `api/server.js`:

```javascript
const metricsRoutes = require('./routes/metricsRoutes');
app.use('/api/metrics', metricsRoutes);
```

---

## 📱 Usage Examples

### View All Metrics (Dashboard)

```bash
curl http://localhost:3000/api/metrics/dashboard
```

**Response:**
```json
{
  "timestamp": "2024-01-15T14:30:00.000Z",
  "date": "2024-01-15",
  "search": {
    "total": 1523,
    "slow": 45,
    "slowPercentage": "2.95"
  },
  "api": {
    "total": 2847,
    "slow": 123,
    "errors": 5,
    "slowPercentage": "4.32",
    "errorRate": "0.18"
  },
  "database": {
    "connectionPool": {
      "size": 20,
      "using": 8,
      "available": 12,
      "waiting": 0,
      "usagePercentage": "40.00"
    },
    "queries": {
      "total": 3456,
      "slow": 234,
      "errors": 2,
      "averageDuration": "45.67"
    }
  },
  "alerts": [
    {
      "level": "warning",
      "type": "database",
      "message": "6.77% of queries are slow (>100ms)"
    }
  ]
}
```

### View Search Metrics Only

```bash
curl http://localhost:3000/api/search/metrics
```

### View Database Metrics Only

```bash
curl http://localhost:3000/api/metrics/database
```

### View API Metrics Only

```bash
curl http://localhost:3000/api/metrics/api
```

---

## 🔔 Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| **Connection Pool Usage** | >80% | >95% | Add more connections or scale DB |
| **Queries Waiting** | >5 | >10 | Immediate scaling needed |
| **Slow Queries** | >10% | >25% | Optimize queries or add indexes |
| **Slow Searches** | >5% | >15% | Scale Elasticsearch |
| **API Error Rate** | >1% | >5% | Investigate errors immediately |
| **API Response Time** | >200ms | >500ms | Optimize endpoints or scale |

---

## 📊 Monitoring Dashboard (Optional - Production)

### Install Dependencies

```bash
# In api/ directory
npm install prom-client express-prom-bundle
```

### Add Prometheus Metrics

Create `api/middleware/prometheus.js`:

```javascript
const promBundle = require('express-prom-bundle');
const client = require('prom-client');

// Create custom metrics
const searchDuration = new client.Histogram({
  name: 'search_duration_ms',
  help: 'Search query duration in milliseconds',
  labelNames: ['endpoint'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
});

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_ms',
  help: 'Database query duration in milliseconds',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
});

const connectionPoolGauge = new client.Gauge({
  name: 'db_connection_pool_usage',
  help: 'Database connection pool usage',
  labelNames: ['state'], // using, available, waiting
});

// Express middleware
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { app: 'event-api' },
  promClient: { collectDefaultMetrics: {} },
});

module.exports = {
  metricsMiddleware,
  searchDuration,
  dbQueryDuration,
  connectionPoolGauge,
};
```

Apply in `api/server.js`:

```javascript
const { metricsMiddleware } = require('./middleware/prometheus');

// Add Prometheus metrics endpoint
app.use(metricsMiddleware);

// Metrics available at /metrics (Prometheus format)
```

### Set Up Grafana Dashboard

1. **Install Prometheus + Grafana:**
```bash
# Add to docker-compose.yml
prometheus:
  image: prom/prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml

grafana:
  image: grafana/grafana
  ports:
    - "3001:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
```

2. **Create prometheus.yml:**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'api'
    static_configs:
      - targets: ['api:3000']
```

3. **Access Grafana:**
- URL: http://localhost:3001
- Login: admin/admin
- Add Prometheus datasource
- Import dashboard templates

---

## 🎯 Daily Monitoring Checklist

### Morning (9 AM)
```bash
# Check overnight metrics
curl http://localhost:3000/api/metrics/dashboard

# Look for:
✓ Any alerts?
✓ Error rate <1%?
✓ Connection pool usage <60%?
✓ Average response time <100ms?
```

### Midday (12 PM - Peak Time)
```bash
# Check during peak traffic
curl http://localhost:3000/api/metrics/dashboard

# Look for:
✓ Connection pool not exhausted?
✓ No queries waiting?
✓ Response times still good?
```

### Evening (6 PM)
```bash
# Review daily stats
curl http://localhost:3000/api/search/metrics
curl http://localhost:3000/api/metrics/api

# Archive metrics if needed
```

---

## 🚨 When to Take Action

### Immediate Action Required
```
🚨 Connection pool waiting > 0
→ Queries are being blocked!
→ Action: Increase pool size OR scale database

🚨 Error rate > 5%
→ Something is broken!
→ Action: Check logs, investigate errors

🚨 API response time > 500ms average
→ Users experiencing slowness
→ Action: Profile slow endpoints, optimize
```

### Plan Scaling Soon
```
⚠️  Connection pool usage > 80%
→ Will hit limit soon
→ Action: Plan to increase pool or add replicas

⚠️  Slow queries > 10%
→ Database under pressure
→ Action: Review indexes, optimize queries

⚠️  Search slow > 5%
→ Elasticsearch stressed
→ Action: Plan ES scaling (more nodes)
```

---

## 📝 Log Files Location

```bash
# API logs
docker-compose logs -f api

# Search-specific logs
docker-compose logs api | grep "\[SEARCH\]"

# Database logs
docker-compose logs api | grep "\[DB"

# Connection pool logs
docker-compose logs api | grep "\[DB POOL\]"

# Slow queries only
docker-compose logs api | grep "SLOW"
```

---

## 🎓 Next Steps

1. **Implement Basic Monitoring (Today):**
   - Add all middleware files
   - Test metrics endpoints
   - Set up log monitoring

2. **Set Up Alerts (This Week):**
   - Configure alert thresholds
   - Set up email/Slack notifications
   - Create runbook for common issues

3. **Add Production Monitoring (Month 1):**
   - Set up Prometheus + Grafana
   - Create custom dashboards
   - Configure automatic alerts

4. **Continuous Improvement:**
   - Review metrics weekly
   - Optimize slow queries
   - Plan scaling based on trends

---

## 📚 Related Documentation

- [SERVICE_GROWTH_ANALYSIS.md](SERVICE_GROWTH_ANALYSIS.md) - Which services will grow
- [SCALABILITY_ANALYSIS.md](SCALABILITY_ANALYSIS.md) - Capacity limits
- [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md) - Production monitoring setup

---

**Remember:** You can't improve what you don't measure. Start monitoring today!
