require('dotenv').config();
const express = require('express');
const RabbitMQWorker = require('./config/rabbitmq');
const { checkConnection, initializeIndex } = require('./config/elasticsearch');
const { sequelize } = require('./config/database');
const {
  syncEventToElastic,
  bulkSyncToElastic,
} = require('./processors/elasticSyncProcessor');
const { initializeScheduledJobs } = require('./jobs/scheduledJobs');

const app = express();
const HEALTH_PORT = process.env.HEALTH_PORT || 3004;

const bindings = [
  'event.created',
  'event.updated',
  'event.deleted',
  'order.created',
];

const worker = new RabbitMQWorker('search-service', bindings);

const startWorker = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    const esConnected = await checkConnection();
    if (!esConnected) {
      throw new Error('Elasticsearch connection failed');
    }

    await initializeIndex();

    worker.registerHandler('event.created', async (data) => {
      console.log(`Processing event.created`);
      await syncEventToElastic({ data: { operation: 'create', ...data } });
    });

    worker.registerHandler('event.updated', async (data) => {
      console.log(`Processing event.updated`);
      await syncEventToElastic({ data: { operation: 'update', ...data } });
    });

    worker.registerHandler('event.deleted', async (data) => {
      console.log(`Processing event.deleted`);
      await syncEventToElastic({ data: { operation: 'delete', ...data } });
    });

    worker.registerHandler('order.created', async (data) => {
      console.log(`Processing order.created for search indexing`);
    });

    worker.start();

    initializeScheduledJobs();

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        const dbHealthy = await sequelize.authenticate().then(() => true).catch(() => false);
        const esHealthy = await checkConnection();

        const isHealthy = dbHealthy && esHealthy && worker.connection;

        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: 'worker',
          timestamp: new Date().toISOString(),
          dependencies: {
            database: dbHealthy ? 'connected' : 'disconnected',
            elasticsearch: esHealthy ? 'connected' : 'disconnected',
            rabbitmq: worker.connection ? 'connected' : 'disconnected',
          },
          queue: worker.QUEUE
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          service: 'worker',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    const server = app.listen(HEALTH_PORT, () => {
      console.log(`✓ Health check endpoint running on port ${HEALTH_PORT}`);
    });

    console.log('✓ Background worker started');
    console.log('✓ Listening for events:', bindings);

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      console.log(`${signal} received, closing worker...`);
      server.close(() => {
        console.log('✓ HTTP server closed');
      });
      await worker.close();
      console.log('✓ RabbitMQ worker closed');
      await sequelize.close();
      console.log('✓ Database connection closed');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('✗ Failed to start worker:', error);
    process.exit(1);
  }
};

startWorker();
