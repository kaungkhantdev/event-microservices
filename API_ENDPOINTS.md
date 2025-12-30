# API Endpoints Quick Reference

## Base URL
```
http://localhost:3000/api
```

## Event CRUD Operations

### Create Event
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

**Response:** `201 Created`

---

### Get All Events (PostgreSQL)
```http
GET /api/events?page=1&limit=10&status=published&category=Technology
```

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `status` - Filter by status
- `category` - Filter by category
- `search` - Basic text search
- `startDate` - From date
- `endDate` - To date

**Response:** `200 OK`

---

### Get Event by ID
```http
GET /api/events/:id
```

**Response:** `200 OK` or `404 Not Found`

---

### Update Event
```http
PUT /api/events/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "status": "cancelled"
}
```

**Response:** `200 OK` or `404 Not Found`

---

### Delete Event
```http
DELETE /api/events/:id
```

**Response:** `200 OK` or `404 Not Found`

---

## Elasticsearch Search Operations

### Full-Text Search
```http
GET /api/search?q=conference&page=1&limit=20&sortBy=relevance
```

**Query Parameters:**
- `q` - Search query (multi-field, fuzzy)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 10, max: 100)
- `status` - Filter by status
- `category` - Filter by category
- `location` - Fuzzy location search
- `startDate` - From date (ISO format)
- `endDate` - To date (ISO format)
- `sortBy` - Sort order:
  - `relevance` (default)
  - `date_asc`
  - `date_desc`
  - `title`

**Features:**
- ✅ Full-text search across title, description, organizer, location
- ✅ Fuzzy matching (handles typos)
- ✅ Search term highlighting
- ✅ Real-time aggregations (facets)
- ✅ Relevance scoring

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "events": [...],
    "pagination": {
      "total": 145,
      "page": 1,
      "limit": 20,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    },
    "aggregations": {
      "byStatus": [...],
      "byCategory": [...],
      "byDateRange": [...]
    }
  }
}
```

---

### Autocomplete/Suggestions
```http
GET /api/search/suggest?q=tech
```

**Query Parameters:**
- `q` - Search prefix (min 2 characters)

**Use Case:** Type-ahead search box

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "id": "uuid",
        "title": "Tech Summit 2024",
        "category": "Technology",
        "startDate": "2024-06-15"
      }
    ]
  }
}
```

---

### Get Aggregations/Statistics
```http
GET /api/search/aggregations
```

**Use Case:** Dashboard analytics, filter counts

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "statusDistribution": [...],
    "categoryDistribution": [...],
    "eventsByMonth": [...],
    "upcomingEventsCount": 312,
    "pastEventsCount": 347,
    "avgMaxAttendees": 156.78
  }
}
```

---

## Health Check

### API Health
```http
GET /health
```

**Response:** `200 OK`
```json
{
  "status": "OK",
  "service": "Event API",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Caching Behavior

### Cached Endpoints (Redis)
| Endpoint | TTL | Cache Key |
|----------|-----|-----------|
| `GET /api/events` | 5 min | `event:/api/events?...` |
| `GET /api/events/:id` | 10 min | `event:/api/events/:id` |
| `GET /api/search` | 3 min | `event:/api/search?...` |
| `GET /api/search/suggest` | 5 min | `event:/api/search/suggest?...` |
| `GET /api/search/aggregations` | 10 min | `event:/api/search/aggregations` |

### Cache Invalidation
All `event:*` caches are cleared on:
- `POST /api/events`
- `PUT /api/events/:id`
- `DELETE /api/events/:id`

---

## Background Jobs

### Triggered Automatically

#### On Event Creation
1. **Elasticsearch Sync** - Index new event
2. **Email Notification** - Send "new event" email

#### On Event Update
1. **Elasticsearch Sync** - Update indexed event
2. **Cache Invalidation** - Clear all event caches

#### On Event Deletion
1. **Elasticsearch Sync** - Remove from index
2. **Cache Invalidation** - Clear all event caches

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "title",
      "message": "\"title\" is required"
    }
  ]
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Event not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Usage Examples

### cURL

```bash
# Create event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Event",
    "startDate": "2024-06-15T09:00:00Z",
    "endDate": "2024-06-15T17:00:00Z"
  }'

# Search events
curl "http://localhost:3000/api/search?q=tech&status=published&page=1&limit=20"

# Get suggestions
curl "http://localhost:3000/api/search/suggest?q=tech"
```

### JavaScript (Fetch API)

```javascript
// Create event
const createEvent = async (eventData) => {
  const response = await fetch('http://localhost:3000/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData)
  });
  return await response.json();
};

// Search with filters
const searchEvents = async (filters) => {
  const params = new URLSearchParams({
    q: filters.query,
    status: filters.status,
    page: filters.page,
    limit: 20
  });

  const response = await fetch(`http://localhost:3000/api/search?${params}`);
  return await response.json();
};

// Autocomplete
const getSuggestions = async (query) => {
  const response = await fetch(
    `http://localhost:3000/api/search/suggest?q=${encodeURIComponent(query)}`
  );
  return await response.json();
};
```

### Python (requests)

```python
import requests

# Create event
response = requests.post(
    'http://localhost:3000/api/events',
    json={
        'title': 'My Event',
        'startDate': '2024-06-15T09:00:00Z',
        'endDate': '2024-06-15T17:00:00Z'
    }
)
data = response.json()

# Search events
response = requests.get(
    'http://localhost:3000/api/search',
    params={
        'q': 'tech',
        'status': 'published',
        'page': 1,
        'limit': 20
    }
)
results = response.json()
```

---

## Rate Limiting

Currently **not implemented**. Consider adding for production:
- Use `express-rate-limit` middleware
- Recommended: 100 requests per 15 minutes per IP
- Return `429 Too Many Requests` when exceeded

---

## Authentication

Currently **not implemented**. Consider adding:
- JWT tokens
- API keys
- OAuth 2.0

---

## Documentation Links

- 📖 [Full Search API Documentation](SEARCH_API.md)
- 🏗️ [Architecture Details](ARCHITECTURE.md)
- 📘 [Main README](README.md)
