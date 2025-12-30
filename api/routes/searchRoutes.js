const express = require('express');
const router = express.Router();
const {
  searchEvents,
  suggestEvents,
  getEventAggregations
} = require('../controllers/searchController');
const { cacheMiddleware } = require('../middleware/cache');

router.get('/', cacheMiddleware({ expiration: 180 }), searchEvents);
router.get('/suggest', cacheMiddleware({ expiration: 300 }), suggestEvents);
router.get('/aggregations', cacheMiddleware({ expiration: 600 }), getEventAggregations);

module.exports = router;
