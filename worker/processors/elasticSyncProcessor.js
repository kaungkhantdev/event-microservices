const { esClient } = require('../config/elasticsearch');
const Event = require('../models/Event');

const INDEX_NAME = process.env.ELASTICSEARCH_INDEX || 'events';

const syncEventToElastic = async (job) => {
  const { operation, eventId, data } = job.data;

  try {
    switch (operation) {
      case 'create':
      case 'update':
        let eventData = data;

        if (!eventData && eventId) {
          const event = await Event.findByPk(eventId);
          if (!event) {
            throw new Error(`Event ${eventId} not found in database`);
          }
          eventData = event.toJSON();
        }

        await esClient.index({
          index: INDEX_NAME,
          id: eventData.id,
          document: {
            id: eventData.id,
            title: eventData.title,
            description: eventData.description,
            location: eventData.location,
            startDate: eventData.startDate,
            endDate: eventData.endDate,
            category: eventData.category,
            organizer: eventData.organizer,
            maxAttendees: eventData.maxAttendees,
            status: eventData.status,
            metadata: eventData.metadata,
            createdAt: eventData.createdAt,
            updatedAt: eventData.updatedAt,
          },
        });

        console.log(`✓ Event ${eventId} ${operation}d in Elasticsearch`);
        break;

      case 'delete':
        await esClient.delete({
          index: INDEX_NAME,
          id: eventId,
        });
        console.log(`✓ Event ${eventId} deleted from Elasticsearch`);
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return { success: true, operation, eventId };
  } catch (error) {
    if (error.meta?.statusCode === 404 && operation === 'delete') {
      console.log(`Event ${eventId} already deleted from Elasticsearch`);
      return { success: true, operation, eventId };
    }
    console.error(`✗ Elasticsearch sync failed for event ${eventId}:`, error);
    throw error;
  }
};

const bulkSyncToElastic = async (job) => {
  const { limit = 100, offset = 0 } = job.data;

  try {
    const events = await Event.findAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    if (events.length === 0) {
      return { success: true, message: 'No events to sync', count: 0 };
    }

    const operations = events.flatMap(event => [
      { index: { _index: INDEX_NAME, _id: event.id } },
      {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        category: event.category,
        organizer: event.organizer,
        maxAttendees: event.maxAttendees,
        status: event.status,
        metadata: event.metadata,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
    ]);

    const { errors, items } = await esClient.bulk({
      refresh: true,
      operations,
    });

    if (errors) {
      const failedItems = items.filter(item => item.index?.error);
      console.error('✗ Bulk sync had errors:', failedItems);
    }

    console.log(`✓ Bulk synced ${events.length} events to Elasticsearch`);
    return {
      success: true,
      count: events.length,
      errors: errors ? items.filter(item => item.index?.error).length : 0,
    };
  } catch (error) {
    console.error('✗ Bulk sync failed:', error);
    throw error;
  }
};

module.exports = {
  syncEventToElastic,
  bulkSyncToElastic,
};
