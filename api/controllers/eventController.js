const { Op } = require('sequelize');
const Event = require('../models/Event');
const { publishToElasticSync, publishToMail } = require('../queues');
const { invalidateCache } = require('../middleware/cache');

const createEvent = async (req, res, next) => {
  try {
    const eventData = req.validatedData || req.body;

    const event = await Event.create(eventData);

    await Promise.all([
      publishToElasticSync('event.created', {
        operation: 'create',
        eventId: event.id,
        data: event.toJSON()
      }, { priority: 7 }),
      publishToMail('event.created', {
        eventId: event.id,
        title: event.title,
        startDate: event.startDate
      }, { priority: 5 }),
      invalidateCache('event:*')
    ]);

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

const getAllEvents = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      startDate,
      endDate,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (status) where.status = status;
    if (category) where.category = category;
    if (startDate) where.startDate = { [Op.gte]: new Date(startDate) };
    if (endDate) where.endDate = { [Op.lte]: new Date(endDate) };
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Event.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        events: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.validatedData || req.body;

    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    await event.update(updateData);

    await Promise.all([
      publishToElasticSync('event.updated', {
        operation: 'update',
        eventId: event.id,
        data: event.toJSON()
      }, { priority: 7 }),
      invalidateCache('event:*')
    ]);

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    await event.destroy();

    await Promise.all([
      publishToElasticSync('event.deleted', {
        operation: 'delete',
        eventId: id
      }, { priority: 7 }),
      invalidateCache('event:*')
    ]);

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent
};
