const cache = require('../utils/cache');

const cacheMiddleware = (options = {}) => {
  const {
    expiration = 3600,
    keyGenerator = null
  } = options;

  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = keyGenerator
        ? keyGenerator(req)
        : cache.generateKey('event', req.originalUrl);

      const cachedData = await cache.get(cacheKey);

      if (cachedData) {
        console.log(`✓ Cache HIT: ${cacheKey}`);
        return res.json(cachedData);
      }

      console.log(`✗ Cache MISS: ${cacheKey}`);

      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode === 200 && data.success !== false) {
          cache.set(cacheKey, data, expiration).catch(err => {
            console.error('Failed to set cache:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

const invalidateCache = async (pattern) => {
  try {
    await cache.delPattern(pattern);
    console.log(`✓ Cache invalidated: ${pattern}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};

module.exports = {
  cacheMiddleware,
  invalidateCache
};
