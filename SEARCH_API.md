# Elasticsearch Search API Documentation

## Overview

The Event Management System includes a powerful Elasticsearch-based search API that follows real-world design patterns for production applications.

## Architecture

```
Client Request
      ↓
  API Layer (/api/search)
      ↓
Cache Check (Redis - 3 min TTL)
      ↓
Elasticsearch Query
      ↓
Format Response with Pagination & Aggregations
      ↓
Return JSON + Cache Result
```

## Endpoints

### 1. Full-Text Search

**Endpoint:** `GET /api/search`

**Purpose:** Main search endpoint with filtering, pagination, and aggregations

**Query Parameters:**
- `q` (string) - Search query
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10, max: 100) - Results per page
- `status` (string) - Filter by status (draft, published, cancelled, completed)
- `category` (string) - Filter by category
- `location` (string) - Fuzzy match location
- `startDate` (ISO date) - Events starting from this date
- `endDate` (ISO date) - Events ending before this date
- `sortBy` (string) - Sort order: `relevance`, `date_asc`, `date_desc`, `title`

**Example Requests:**

```bash
# Basic search
curl "http://localhost:3000/api/search?q=technology"

# Search with filters
curl "http://localhost:3000/api/search?q=conference&status=published&category=Technology&page=2&limit=20"

# Location-based search
curl "http://localhost:3000/api/search?location=San%20Francisco&sortBy=date_desc"

# Date range search
curl "http://localhost:3000/api/search?startDate=2024-06-01&endDate=2024-12-31"
```

**Response Structure:**

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "score": 2.4567,
        "title": "Tech Conference 2024",
        "description": "Annual technology conference...",
        "location": "San Francisco, CA",
        "startDate": "2024-06-15T09:00:00Z",
        "endDate": "2024-06-15T17:00:00Z",
        "category": "Technology",
        "status": "published",
        "maxAttendees": 500,
        "highlight": {
          "title": ["<mark>Tech</mark> <mark>Conference</mark> 2024"],
          "description": ["Annual <mark>technology</mark> conference..."]
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
    },
    "query": {
      "q": "conference",
      "status": "published",
      "category": "Technology",
      "sortBy": "relevance"
    }
  }
}
```

### 2. Autocomplete/Suggestions

**Endpoint:** `GET /api/search/suggest`

**Purpose:** Type-ahead suggestions for search box

**Query Parameters:**
- `q` (string, min 2 chars) - Prefix to search for

**Example:**

```bash
curl "http://localhost:3000/api/search/suggest?q=tech"
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
        "startDate": "2024-06-15T09:00:00Z"
      },
      {
        "id": "uuid-2",
        "title": "TechCrunch Disrupt",
        "category": "Technology",
        "startDate": "2024-09-20T09:00:00Z"
      }
    ]
  }
}
```

### 3. Statistics & Aggregations

**Endpoint:** `GET /api/search/aggregations`

**Purpose:** Get event statistics and distributions

**Example:**

```bash
curl "http://localhost:3000/api/search/aggregations"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "statusDistribution": [
      { "key": "published", "doc_count": 450 },
      { "key": "draft", "doc_count": 120 },
      { "key": "completed", "doc_count": 89 },
      { "key": "cancelled", "doc_count": 23 }
    ],
    "categoryDistribution": [
      { "key": "Technology", "doc_count": 230 },
      { "key": "Business", "doc_count": 180 },
      { "key": "Entertainment", "doc_count": 145 }
    ],
    "eventsByMonth": [
      { "key": "2024-01", "doc_count": 45 },
      { "key": "2024-02", "doc_count": 52 },
      { "key": "2024-03", "doc_count": 38 }
    ],
    "upcomingEventsCount": 312,
    "pastEventsCount": 347,
    "avgMaxAttendees": 156.78
  }
}
```

## Search Features

### 1. Multi-Field Search with Boosting

The search query searches across multiple fields with different weights:
- **title^3** - Title is most important (3x boost)
- **description^2** - Description is important (2x boost)
- **organizer** - Normal weight
- **location** - Normal weight

```javascript
// Example: Searching "tech conference"
// Will prioritize matches in title over description
{
  "multi_match": {
    "query": "tech conference",
    "fields": ["title^3", "description^2", "organizer", "location"],
    "type": "best_fields",
    "fuzziness": "AUTO"
  }
}
```

### 2. Fuzzy Matching

Automatically handles typos:
- `technlogy` → `technology`
- `conferance` → `conference`
- `San Fransisco` → `San Francisco`

### 3. Highlighting

Search terms are highlighted in results with `<mark>` tags:

```json
"highlight": {
  "title": ["<mark>Tech</mark> <mark>Conference</mark> 2024"]
}
```

Frontend can render these with CSS:
```css
mark {
  background-color: yellow;
  font-weight: bold;
}
```

### 4. Real-Time Faceted Search

Aggregations update in real-time based on current search:
- **Status distribution** - Count by status
- **Category distribution** - Count by category
- **Date range** - Upcoming vs past events

Use these to build filter UI:
```
Status:
☑ Published (120)
☐ Draft (25)

Category:
☑ Technology (85)
☐ Business (60)
```

### 5. Multiple Sort Options

```bash
# Sort by relevance (best matches first)
?sortBy=relevance

# Sort by date (oldest first)
?sortBy=date_asc

# Sort by date (newest first)
?sortBy=date_desc

# Sort alphabetically by title
?sortBy=title
```

## Pagination Best Practices

### Offset-Based Pagination

✅ **Good for:**
- Small to medium datasets (< 10,000 results)
- Direct page access (jump to page 5)
- Simple UI implementation

```bash
# Page 1
?page=1&limit=20

# Page 2
?page=2&limit=20
```

⚠️ **Limitations:**
- Performance degrades with deep pagination (page 1000+)
- Not suitable for real-time data (consistency issues)

### Response Metadata

```json
"pagination": {
  "total": 145,
  "page": 2,
  "limit": 20,
  "totalPages": 8,
  "hasNext": true,    // Used for "Next" button
  "hasPrev": true     // Used for "Previous" button
}
```

### Frontend Implementation

```javascript
// React/Vue example
function Pagination({ pagination }) {
  return (
    <div>
      {pagination.hasPrev && (
        <button onClick={() => goToPage(pagination.page - 1)}>
          Previous
        </button>
      )}

      <span>Page {pagination.page} of {pagination.totalPages}</span>

      {pagination.hasNext && (
        <button onClick={() => goToPage(pagination.page + 1)}>
          Next
        </button>
      )}
    </div>
  );
}
```

## Performance Optimization

### 1. Caching Strategy

All search endpoints are cached in Redis:
- **Search results**: 3 minutes (180s)
- **Suggestions**: 5 minutes (300s)
- **Aggregations**: 10 minutes (600s)

### 2. Index Optimization

The worker service maintains the Elasticsearch index:
- **Real-time sync**: Updates within 1-2 seconds
- **Bulk sync**: Available for data recovery
- **Mapping**: Optimized for text search and aggregations

### 3. Query Optimization

```javascript
// Only fetch needed fields
"_source": ["title", "description", "startDate", "category"]

// Limit aggregation buckets
"aggs": {
  "categories": {
    "terms": { "field": "category", "size": 20 }
  }
}

// Track total hits efficiently
"track_total_hits": true  // or 10000 for large indices
```

## Error Handling

### Index Not Found

If Elasticsearch index doesn't exist yet:

```json
{
  "success": true,
  "data": {
    "events": [],
    "pagination": {
      "total": 0,
      "page": 1,
      "limit": 10,
      "totalPages": 0,
      "hasNext": false,
      "hasPrev": false
    },
    "message": "Elasticsearch index not ready. Using database search."
  }
}
```

### Connection Failure

Falls back gracefully - worker will sync when ES comes back online.

## Real-World Use Cases

### 1. Search Bar with Autocomplete

```javascript
// As user types
const handleSearch = debounce(async (query) => {
  if (query.length < 2) return;

  const suggestions = await fetch(
    `/api/search/suggest?q=${encodeURIComponent(query)}`
  );

  // Show dropdown with suggestions
}, 300);
```

### 2. Advanced Filter Page

```javascript
const searchEvents = async (filters) => {
  const params = new URLSearchParams({
    q: filters.query,
    status: filters.status,
    category: filters.category,
    location: filters.location,
    startDate: filters.startDate,
    endDate: filters.endDate,
    page: filters.page,
    limit: 20,
    sortBy: filters.sortBy
  });

  const response = await fetch(`/api/search?${params}`);
  const data = await response.json();

  // Display results
  displayEvents(data.data.events);

  // Update facets/filters UI
  updateFacets(data.data.aggregations);

  // Update pagination
  updatePagination(data.data.pagination);
};
```

### 3. Dashboard Analytics

```javascript
const loadDashboard = async () => {
  const stats = await fetch('/api/search/aggregations');
  const data = await stats.json();

  // Display charts
  renderStatusChart(data.data.statusDistribution);
  renderCategoryChart(data.data.categoryDistribution);
  renderTimelineChart(data.data.eventsByMonth);

  // Show KPIs
  showUpcomingCount(data.data.upcomingEventsCount);
  showAverageAttendees(data.data.avgMaxAttendees);
};
```

## Testing

```bash
# Test search
curl "http://localhost:3000/api/search?q=test"

# Test with all filters
curl "http://localhost:3000/api/search?q=tech&status=published&category=Technology&location=SF&startDate=2024-01-01&endDate=2024-12-31&sortBy=date_desc&page=1&limit=20"

# Test autocomplete
curl "http://localhost:3000/api/search/suggest?q=con"

# Test aggregations
curl "http://localhost:3000/api/search/aggregations"

# Check Elasticsearch health
curl "http://localhost:9200/_cluster/health?pretty"

# View index mapping
curl "http://localhost:9200/events/_mapping?pretty"
```

## Comparison: Database vs Elasticsearch

| Feature | PostgreSQL | Elasticsearch |
|---------|-----------|---------------|
| Full-text search | Basic (tsvector) | Advanced |
| Fuzzy matching | Limited | Excellent |
| Relevance scoring | No | Yes |
| Highlighting | No | Yes |
| Aggregations | Slow on large data | Fast |
| Pagination | Good | Excellent |
| Faceted search | Complex queries | Built-in |
| Performance | Good < 1M rows | Excellent at scale |

## When to Use Each

### Use PostgreSQL Search (`/api/events`)
- Simple exact matches
- Small datasets
- Admin interfaces
- Data integrity is critical

### Use Elasticsearch Search (`/api/search`)
- User-facing search
- Large datasets (100k+ records)
- Need fuzzy matching
- Need aggregations/facets
- Need autocomplete
- Need relevance scoring
