const express = require('express');
const router = express.Router();
const {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent
} = require('../controllers/eventController');
const { validate, eventValidationSchema } = require('../middleware/validator');
const { cacheMiddleware } = require('../middleware/cache');

router.post('/', validate(eventValidationSchema.create), createEvent);
router.get('/', cacheMiddleware({ expiration: 300 }), getAllEvents);
router.get('/:id', cacheMiddleware({ expiration: 600 }), getEventById);
router.put('/:id', validate(eventValidationSchema.update), updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
