const { esClient, INDEX_NAME } = require('../config/elasticsearch');
const cache = require('../utils/cache');

const searchEvents = async (req, res, next) => {
  try {
    const {
      q = '',
      page = 1,
      limit = 10,
      status,
      category,
      startDate,
      endDate,
      sortBy = 'relevance',
      location
    } = req.query;

    const from = (page - 1) * limit;
    const size = parseInt(limit);

    const must = [];
    const filter = [];

    if (q) {
      must.push({
        multi_match: {
          query: q,
          fields: [
            'title^3',
            'description^2',
            'organizer',
            'location'
          ],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    } else {
      must.push({ match_all: {} });
    }

    if (status) {
      filter.push({ term: { status } });
    }

    if (category) {
      filter.push({ term: { category } });
    }

    if (location) {
      filter.push({
        match: {
          location: {
            query: location,
            fuzziness: 'AUTO'
          }
        }
      });
    }

    if (startDate || endDate) {
      const rangeQuery = { range: { startDate: {} } };
      if (startDate) rangeQuery.range.startDate.gte = startDate;
      if (endDate) rangeQuery.range.startDate.lte = endDate;
      filter.push(rangeQuery);
    }

    let sort = [];
    switch (sortBy) {
      case 'date_asc':
        sort = [{ startDate: 'asc' }];
        break;
      case 'date_desc':
        sort = [{ startDate: 'desc' }];
        break;
      case 'title':
        sort = [{ 'title.keyword': 'asc' }];
        break;
      case 'relevance':
      default:
        sort = ['_score', { startDate: 'desc' }];
        break;
    }

    const searchBody = {
      query: {
        bool: {
          must,
          filter
        }
      },
      sort,
      from,
      size,
      track_total_hits: true,
      highlight: {
        fields: {
          title: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
          description: { pre_tags: ['<mark>'], post_tags: ['</mark>'] }
        }
      },
      aggs: {
        status_counts: {
          terms: { field: 'status', size: 10 }
        },
        category_counts: {
          terms: { field: 'category', size: 20 }
        },
        date_range: {
          date_range: {
            field: 'startDate',
            ranges: [
              { key: 'upcoming', from: 'now' },
              { key: 'past', to: 'now' }
            ]
          }
        }
      }
    };

    const result = await esClient.search({
      index: INDEX_NAME,
      body: searchBody
    });

    const hits = result.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      highlight: hit.highlight
    }));

    const total = result.hits.total.value;
    const totalPages = Math.ceil(total / size);

    res.json({
      success: true,
      data: {
        events: hits,
        pagination: {
          total,
          page: parseInt(page),
          limit: size,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        aggregations: {
          byStatus: result.aggregations.status_counts.buckets,
          byCategory: result.aggregations.category_counts.buckets,
          byDateRange: result.aggregations.date_range.buckets
        },
        query: {
          q,
          status,
          category,
          location,
          startDate,
          endDate,
          sortBy
        }
      }
    });
  } catch (error) {
    if (error.meta?.body?.error?.type === 'index_not_found_exception') {
      return res.status(200).json({
        success: true,
        data: {
          events: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          },
          message: 'Elasticsearch index not ready. Using database search.'
        }
      });
    }
    next(error);
  }
};

const suggestEvents = async (req, res, next) => {
  try {
    const { q = '' } = req.query;

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { suggestions: [] }
      });
    }

    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        suggest: {
          title_suggest: {
            prefix: q,
            completion: {
              field: 'title.suggest',
              size: 5,
              fuzzy: {
                fuzziness: 'AUTO'
              }
            }
          }
        },
        _source: ['title', 'startDate', 'category'],
        size: 5,
        query: {
          bool: {
            should: [
              {
                match_phrase_prefix: {
                  title: {
                    query: q,
                    boost: 3
                  }
                }
              },
              {
                match: {
                  category: {
                    query: q,
                    boost: 2
                  }
                }
              }
            ]
          }
        }
      }
    });

    const suggestions = result.hits.hits.map(hit => ({
      id: hit._id,
      title: hit._source.title,
      category: hit._source.category,
      startDate: hit._source.startDate
    }));

    res.json({
      success: true,
      data: { suggestions }
    });
  } catch (error) {
    next(error);
  }
};

const getEventAggregations = async (req, res, next) => {
  try {
    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          status_distribution: {
            terms: { field: 'status', size: 10 }
          },
          category_distribution: {
            terms: { field: 'category', size: 50 }
          },
          events_by_month: {
            date_histogram: {
              field: 'startDate',
              calendar_interval: 'month',
              format: 'yyyy-MM'
            }
          },
          upcoming_events: {
            filter: {
              range: {
                startDate: { gte: 'now' }
              }
            }
          },
          past_events: {
            filter: {
              range: {
                startDate: { lt: 'now' }
              }
            }
          },
          avg_attendees: {
            avg: { field: 'maxAttendees' }
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        statusDistribution: result.aggregations.status_distribution.buckets,
        categoryDistribution: result.aggregations.category_distribution.buckets,
        eventsByMonth: result.aggregations.events_by_month.buckets,
        upcomingEventsCount: result.aggregations.upcoming_events.doc_count,
        pastEventsCount: result.aggregations.past_events.doc_count,
        avgMaxAttendees: result.aggregations.avg_attendees.value
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchEvents,
  suggestEvents,
  getEventAggregations
};
