require('dotenv').config();
const express = require('express');
const Queue = require('bull');
const { checkConnection, initializeIndex } = require('./config/elasticsearch');
const { sequelize } = require('./config/database');
const {
  syncEventToElastic,
  bulkSyncToElastic,
} = require('./processors/elasticSyncProcessor');
const { initializeScheduledJobs } = require('./jobs/scheduledJobs');

const app = express();
const HEALTH_PORT = process.env.HEALTH_PORT || 3004;

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const elasticSyncQueue = new Queue('elastic-sync', redisConfig);

const startWorker = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    const esConnected = await checkConnection();
    if (!esConnected) {
      throw new Error('Elasticsearch connection failed');
    }

    await initializeIndex();

    elasticSyncQueue.process('sync-event', 5, async (job) => {
      console.log(`Processing sync-event job: ${job.id}`);
      return await syncEventToElastic(job);
    });

    elasticSyncQueue.process('bulk-sync', 1, async (job) => {
      console.log(`Processing bulk-sync job: ${job.id}`);
      return await bulkSyncToElastic(job);
    });

    elasticSyncQueue.on('completed', (job, result) => {
      console.log(`✓ Job ${job.id} completed:`, result);
    });

    elasticSyncQueue.on('failed', (job, err) => {
      console.error(`✗ Job ${job.id} failed:`, err.message);
    });

    elasticSyncQueue.on('error', (error) => {
      console.error('✗ Queue error:', error);
    });

    initializeScheduledJobs();

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        const dbHealthy = await sequelize.authenticate().then(() => true).catch(() => false);
        const esHealthy = await checkConnection();
        const queueHealth = await elasticSyncQueue.client.ping();
        const jobCounts = await elasticSyncQueue.getJobCounts();

        const isHealthy = dbHealthy && esHealthy && queueHealth === 'PONG';

        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: 'worker',
          timestamp: new Date().toISOString(),
          dependencies: {
            database: dbHealthy ? 'connected' : 'disconnected',
            elasticsearch: esHealthy ? 'connected' : 'disconnected',
            redis: queueHealth === 'PONG' ? 'connected' : 'disconnected',
          },
          queue: {
            waiting: jobCounts.waiting,
            active: jobCounts.active,
            completed: jobCounts.completed,
            failed: jobCounts.failed,
          }
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
    console.log('✓ Listening for Elasticsearch sync jobs');

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      console.log(`${signal} received, closing worker...`);
      server.close(() => {
        console.log('✓ HTTP server closed');
      });
      await elasticSyncQueue.close();
      console.log('✓ Elastic sync queue closed');
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
