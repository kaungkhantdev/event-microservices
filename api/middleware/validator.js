const Joi = require('joi');

const eventValidationSchema = {
  create: Joi.object({
    title: Joi.string().min(3).max(255).required(),
    description: Joi.string().allow('', null),
    location: Joi.string().allow('', null),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
    category: Joi.string().allow('', null),
    organizer: Joi.string().allow('', null),
    maxAttendees: Joi.number().integer().min(1).allow(null),
    status: Joi.string().valid('draft', 'published', 'cancelled', 'completed').default('draft'),
    metadata: Joi.object().allow(null)
  }),

  update: Joi.object({
    title: Joi.string().min(3).max(255),
    description: Joi.string().allow('', null),
    location: Joi.string().allow('', null),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().when('startDate', {
      is: Joi.exist(),
      then: Joi.date().greater(Joi.ref('startDate'))
    }),
    category: Joi.string().allow('', null),
    organizer: Joi.string().allow('', null),
    maxAttendees: Joi.number().integer().min(1).allow(null),
    status: Joi.string().valid('draft', 'published', 'cancelled', 'completed'),
    metadata: Joi.object().allow(null)
  }).min(1)
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    req.validatedData = value;
    next();
  };
};

module.exports = {
  eventValidationSchema,
  validate
};
