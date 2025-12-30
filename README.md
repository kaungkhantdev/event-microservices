# Event Management System

A microservices-based event management system built with Express.js, featuring CRUD operations, Elasticsearch integration, mail queue system, and background workers.

## Architecture

The system consists of three main services:

1. **API Service** ([api/](api/)) - RESTful API for event CRUD operations
2. **Mail Queue Service** ([mail-queue/](mail-queue/)) - Handles email notifications
3. **Worker Service** ([worker/](worker/)) - Background processing for Elasticsearch sync

### Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Search**: Elasticsearch
- **Queue**: Bull (Redis-based)
- **Email**: Nodemailer with Handlebars templates
- **Containerization**: Docker & Docker Compose

## Features

### API Service
- Create, Read, Update, Delete events
- **Elasticsearch full-text search** with pagination
- **Faceted search** with aggregations
- **Autocomplete/suggestions** API
- **Redis caching layer** for GET requests
- Cache invalidation on data mutations
- Input validation with Joi
- Error handling middleware
- Advanced filtering and sorting
- Auto-queue jobs for email and Elasticsearch sync

📖 **[Full Search API Documentation](SEARCH_API.md)**

### Mail Queue Service
Supports 4 types of emails (priority order):
1. **Forgot Password** (Highest Priority) - Password reset emails
2. **New Event** - Event creation notifications
3. **Registration** - Welcome emails for new users
4. **Reminder** - Event reminder notifications

### Worker Service
- **Real-time Elasticsearch sync** via queue jobs
- **Scheduled jobs** (cron) for maintenance tasks:
  - Send event reminders (daily at 9 AM)
  - Cleanup old events (daily at 2 AM)
  - Full ES sync (daily at 3 AM)
  - Auto-update event statuses (every 30 min)
  - Generate daily reports (daily at 8 AM)
- Bulk sync capability
- Automatic index creation and mapping
- Retry mechanism for failed jobs

📖 **[Scheduled Jobs Documentation](SCHEDULED_JOBS.md)**

## Project Structure

```
.
├── api/
│   ├── config/
│   │   ├── database.js
│   │   └── redis.js
│   ├── controllers/
│   │   └── eventController.js
│   ├── middleware/
│   │   ├── cache.js
│   │   ├── errorHandler.js
│   │   └── validator.js
│   ├── models/
│   │   └── Event.js
│   ├── queues/
│   │   └── index.js
│   ├── routes/
│   │   └── eventRoutes.js
│   ├── utils/
│   │   └── cache.js
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
│
├── mail-queue/
│   ├── config/
│   │   └── mailer.js
│   ├── processors/
│   │   └── mailProcessor.js
│   ├── templates/
│   │   ├── forgotPassword.js
│   │   ├── newEvent.js
│   │   ├── registration.js
│   │   └── reminder.js
│   ├── .env.example
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
│
├── worker/
│   ├── config/
│   │   ├── database.js
│   │   └── elasticsearch.js
│   ├── models/
│   │   └── Event.js
│   ├── processors/
│   │   └── elasticSyncProcessor.js
│   ├── .env.example
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── README.md
```

## Installation & Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (if running locally)
- Redis (if running locally)
- Elasticsearch (if running locally)

### Option 1: Using Docker Compose (Recommended)

1. **Clone and navigate to the project**
   ```bash
   cd /path/to/system-design
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your SMTP credentials
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

4. **Check service health**
   ```bash
   docker-compose ps
   ```

Services will be available at:
- API: http://localhost:3000
- Elasticsearch: http://localhost:9200
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Option 2: Local Development

1. **Install dependencies for each service**
   ```bash
   cd api && npm install
   cd ../mail-queue && npm install
   cd ../worker && npm install
   ```

2. **Set up environment variables**
   ```bash
   cp api/.env.example api/.env
   cp mail-queue/.env.example mail-queue/.env
   cp worker/.env.example worker/.env
   # Edit each .env file with your configuration
   ```

3. **Start PostgreSQL, Redis, and Elasticsearch**
   ```bash
   # Using Docker
   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15-alpine
   docker run -d -p 6379:6379 redis:7-alpine
   docker run -d -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" docker.elastic.co/elasticsearch/elasticsearch:8.11.0
   ```

4. **Start each service in separate terminals**
   ```bash
   # Terminal 1 - API
   cd api && npm run dev

   # Terminal 2 - Mail Queue
   cd mail-queue && npm run dev

   # Terminal 3 - Worker
   cd worker && npm run dev
   ```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Create Event
```http
POST /api/events
Content-Type: application/json

{
  "title": "Tech Conference 2024",
  "description": "Annual technology conference",
  "location": "San Francisco, CA",
  "startDate": "2024-06-15T09:00:00Z",
  "endDate": "2024-06-15T17:00:00Z",
  "category": "Technology",
  "organizer": "Tech Corp",
  "maxAttendees": 500,
  "status": "published"
}
```

#### Get All Events
```http
GET /api/events?page=1&limit=10&status=published&category=Technology
```

#### Get Event by ID
```http
GET /api/events/:id
```

#### Update Event
```http
PUT /api/events/:id
Content-Type: application/json

{
  "title": "Updated Event Title",
  "status": "cancelled"
}
```

#### Delete Event
```http
DELETE /api/events/:id
```

#### Search Events (Elasticsearch)
```http
GET /api/search?q=conference&page=1&limit=10&status=published&category=Technology&sortBy=date_desc
```

#### Autocomplete/Suggest
```http
GET /api/search/suggest?q=tech
```

#### Get Aggregations/Stats
```http
GET /api/search/aggregations
```

### Query Parameters

#### CRUD Endpoints (`/api/events`)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `status` - Filter by status (draft, published, cancelled, completed)
- `category` - Filter by category
- `search` - Search in title and description
- `startDate` - Filter events starting from date
- `endDate` - Filter events ending before date

#### Search Endpoints (`/api/search`)
- `q` - Full-text search query
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 10, max: 100)
- `status` - Filter by status
- `category` - Filter by category
- `location` - Search by location (fuzzy matching)
- `startDate` - Events starting from this date
- `endDate` - Events ending before this date
- `sortBy` - Sort order:
  - `relevance` (default) - Sort by search score
  - `date_asc` - Oldest first
  - `date_desc` - Newest first
  - `title` - Alphabetical by title

## Database Schema

### Events Table
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  category VARCHAR(255),
  organizer VARCHAR(255),
  max_attendees INTEGER,
  status VARCHAR(50) DEFAULT 'draft',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Mail Queue Jobs

### Trigger Mail Jobs

```javascript
// From your application code
const { mailQueue } = require('./queues');

// Forgot Password (Priority 1)
await mailQueue.add('forgot-password', {
  email: 'user@example.com',
  name: 'John Doe',
  resetToken: 'abc123',
  expiryTime: 24
}, { priority: 1 });

// Registration
await mailQueue.add('registration', {
  email: 'user@example.com',
  name: 'John Doe',
  registrationDate: new Date()
});

// Event Reminder
await mailQueue.add('reminder', {
  email: 'user@example.com',
  name: 'John Doe',
  eventTitle: 'Tech Conference',
  eventDate: '2024-06-15',
  eventTime: '09:00 AM',
  location: 'San Francisco',
  timeUntilEvent: '2 hours',
  eventId: 'event-uuid'
});
```

## Elasticsearch Search API

### Real-World Search Examples

#### 1. Full-Text Search with Pagination
```bash
curl -X GET "http://localhost:3000/api/search?q=technology%20conference&page=1&limit=20"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "uuid",
        "score": 2.4567,
        "title": "Technology Conference 2024",
        "description": "Annual tech conference...",
        "highlight": {
          "title": ["<mark>Technology</mark> <mark>Conference</mark> 2024"]
        }
      }
    ],
    "pagination": {
      "total": 145,
      "page": 1,
      "limit": 20,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    },
    "aggregations": {
      "byStatus": [
        { "key": "published", "doc_count": 120 },
        { "key": "draft", "doc_count": 25 }
      ],
      "byCategory": [
        { "key": "Technology", "doc_count": 85 },
        { "key": "Business", "doc_count": 60 }
      ],
      "byDateRange": [
        { "key": "upcoming", "doc_count": 89 },
        { "key": "past", "doc_count": 56 }
      ]
    }
  }
}
```

#### 2. Faceted Search with Filters
```bash
# Search tech events in San Francisco, published status only
curl -X GET "http://localhost:3000/api/search?q=tech&location=San%20Francisco&status=published&category=Technology&sortBy=date_desc"
```

#### 3. Date Range Search
```bash
# Find events happening in Q1 2024
curl -X GET "http://localhost:3000/api/search?startDate=2024-01-01&endDate=2024-03-31&sortBy=date_asc"
```

#### 4. Autocomplete/Suggest API
```bash
curl -X GET "http://localhost:3000/api/search/suggest?q=tech"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "id": "uuid-1",
        "title": "Tech Summit 2024",
        "category": "Technology",
        "startDate": "2024-06-15"
      },
      {
        "id": "uuid-2",
        "title": "TechCrunch Disrupt",
        "category": "Technology",
        "startDate": "2024-09-20"
      }
    ]
  }
}
```

#### 5. Get Statistics & Aggregations
```bash
curl -X GET "http://localhost:3000/api/search/aggregations"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "statusDistribution": [
      { "key": "published", "doc_count": 450 },
      { "key": "draft", "doc_count": 120 },
      { "key": "completed", "doc_count": 89 }
    ],
    "categoryDistribution": [
      { "key": "Technology", "doc_count": 230 },
      { "key": "Business", "doc_count": 180 }
    ],
    "eventsByMonth": [
      { "key": "2024-01", "doc_count": 45 },
      { "key": "2024-02", "doc_count": 52 }
    ],
    "upcomingEventsCount": 312,
    "pastEventsCount": 347,
    "avgMaxAttendees": 156.78
  }
}
```

### Search Features

✅ **Full-Text Search** - Multi-field search with boosting (title^3, description^2)
✅ **Fuzzy Matching** - Handles typos automatically (e.g., "technlogy" → "technology")
✅ **Pagination** - Efficient offset-based pagination with metadata
✅ **Highlighting** - Search terms highlighted in results with `<mark>` tags
✅ **Faceted Search** - Real-time aggregations for filters
✅ **Sorting** - Multiple sort options (relevance, date, title)
✅ **Date Range** - Find events in specific time periods
✅ **Location Search** - Fuzzy location matching
✅ **Autocomplete** - Type-ahead suggestions
✅ **Analytics** - Event statistics and distributions

### Direct Elasticsearch Queries (Advanced)

```bash
# Search by title (direct to Elasticsearch)
curl -X GET "localhost:9200/events/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match": {
      "title": "conference"
    }
  }
}'

# Filter by date range
curl -X GET "localhost:9200/events/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
    "range": {
      "startDate": {
        "gte": "2024-01-01",
        "lte": "2024-12-31"
      }
    }
  }
}'
```

### Manual Bulk Sync
```javascript
const { elasticSyncQueue } = require('./queues');

// Sync 100 events from database to Elasticsearch
await elasticSyncQueue.add('bulk-sync', {
  limit: 100,
  offset: 0
});
```

## Redis Caching

### How It Works
The API implements a **Redis caching layer** to improve performance:

- **GET requests** are automatically cached
- **Cache expiration**:
  - List events: 5 minutes (300s)
  - Single event: 10 minutes (600s)
- **Cache invalidation**: All event caches are cleared on CREATE/UPDATE/DELETE operations

### Cache Keys
```
event:/api/events                    # List all events
event:/api/events?page=1&limit=10    # Paginated list
event:/api/events/:id                # Single event
```

### Manual Cache Operations
```javascript
const cache = require('./utils/cache');

// Get cached data
const data = await cache.get('event:/api/events');

// Set cache with custom expiration (in seconds)
await cache.set('my-key', { data: 'value' }, 3600);

// Delete specific key
await cache.del('event:/api/events');

// Delete all event caches
await cache.delPattern('event:*');

// Flush entire cache
await cache.flush();
```

### Cache Performance Benefits
- **Reduced database load**: Frequently accessed data served from memory
- **Faster response times**: ~1-2ms vs 50-100ms database queries
- **Lower latency**: No network roundtrip to PostgreSQL

## Monitoring

### Check Service Health
```bash
# API Health
curl http://localhost:3000/health

# Elasticsearch Health
curl http://localhost:9200/_cluster/health

# Redis
redis-cli ping

# Check Redis cache keys
redis-cli KEYS "event:*"

# Monitor cache hits/misses (check API logs)
docker-compose logs -f api | grep "Cache"
```

### View Queue Status
```bash
# Install Bull Board (optional)
npm install bull-board
```

## Development

### Running Tests
```bash
cd api && npm test
cd mail-queue && npm test
cd worker && npm test
```

### Logs
```bash
# Docker logs
docker-compose logs -f api
docker-compose logs -f mail-queue
docker-compose logs -f worker

# Local logs
# Logs will appear in the terminal where each service is running
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Check what's using the port
   lsof -i :3000
   # Kill the process or change the port in .env
   ```

2. **Elasticsearch connection failed**
   ```bash
   # Check if Elasticsearch is running
   curl http://localhost:9200
   # Wait for Elasticsearch to be ready (can take 30-60 seconds)
   ```

3. **Mail not sending**
   - Verify SMTP credentials in `.env`
   - For Gmail, use App Password, not regular password
   - Check mail-queue service logs

4. **Database connection error**
   ```bash
   # Verify PostgreSQL is running
   docker-compose ps postgres
   # Check database credentials in .env
   ```

## Production Considerations

- Use environment-specific configurations
- Set up proper logging (Winston, Pino)
- Implement rate limiting
- Add authentication/authorization
- Use HTTPS
- Set up monitoring (Prometheus, Grafana)
- Configure backup strategy for PostgreSQL
- Scale workers based on queue load
- Use Redis Sentinel/Cluster for high availability

## License

MIT
