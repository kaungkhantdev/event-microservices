require('dotenv').config();
const Queue = require('bull');

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const elasticSyncQueue = new Queue('elastic-sync', redisConfig);
const mailQueue = new Queue('mail', redisConfig);
const paymentQueue = new Queue('payment', redisConfig);

elasticSyncQueue.on('error', (error) => {
  console.error('ElasticSync Queue Error:', error);
});

mailQueue.on('error', (error) => {
  console.error('Mail Queue Error:', error);
});

paymentQueue.on('error', (error) => {
  console.error('Payment Queue Error:', error);
});

module.exports = {
  elasticSyncQueue,
  mailQueue,
  paymentQueue
};
