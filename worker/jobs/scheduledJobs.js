const cron = require('node-cron');
const Event = require('../models/Event');
const { esClient } = require('../config/elasticsearch');
const Queue = require('bull');
const { sequelize } = require('../config/database');
const { DataTypes, Op } = require('sequelize');

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const mailQueue = new Queue('mail', redisConfig);
const paymentQueue = new Queue('payment', redisConfig);
const INDEX_NAME = process.env.ELASTICSEARCH_INDEX || 'events';

const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, primaryKey: true },
  userId: { type: DataTypes.STRING, field: 'user_id' },
  amount: { type: DataTypes.DECIMAL(10, 2) },
  currency: { type: DataTypes.STRING(3) },
  status: { type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded') },
  jobId: { type: DataTypes.STRING, field: 'job_id' },
  errorMessage: { type: DataTypes.TEXT, field: 'error_message' },
}, {
  tableName: 'payments',
  timestamps: true,
  underscored: true,
});

const sendEventReminders = async () => {
  try {
    console.log('⏰ Running scheduled job: Send event reminders');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const upcomingEvents = await Event.findAll({
      where: {
        startDate: {
          [require('sequelize').Op.gte]: tomorrow,
          [require('sequelize').Op.lt]: dayAfterTomorrow
        },
        status: 'published'
      }
    });

    console.log(`Found ${upcomingEvents.length} events happening tomorrow`);

    for (const event of upcomingEvents) {
      await mailQueue.add('reminder', {
        email: 'attendees@example.com',
        name: 'Attendee',
        eventTitle: event.title,
        eventDescription: event.description,
        eventDate: event.startDate.toDateString(),
        eventTime: event.startDate.toTimeString(),
        location: event.location,
        timeUntilEvent: '24 hours',
        eventId: event.id
      });
    }

    console.log(`✓ Queued ${upcomingEvents.length} reminder emails`);
  } catch (error) {
    console.error('✗ Error in sendEventReminders job:', error);
  }
};

const cleanupOldEvents = async () => {
  try {
    console.log('🧹 Running scheduled job: Cleanup old events');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const result = await Event.destroy({
      where: {
        endDate: {
          [require('sequelize').Op.lt]: sixMonthsAgo
        },
        status: 'completed'
      }
    });

    console.log(`✓ Deleted ${result} old completed events`);
  } catch (error) {
    console.error('✗ Error in cleanupOldEvents job:', error);
  }
};

const syncElasticsearchDaily = async () => {
  try {
    console.log('🔄 Running scheduled job: Full Elasticsearch sync');

    const allEvents = await Event.findAll({
      order: [['createdAt', 'DESC']]
    });

    if (allEvents.length === 0) {
      console.log('No events to sync');
      return;
    }

    const operations = allEvents.flatMap(event => [
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
      console.error(`✗ Failed to sync ${failedItems.length} events`);
    }

    console.log(`✓ Full sync completed: ${allEvents.length} events`);
  } catch (error) {
    console.error('✗ Error in syncElasticsearchDaily job:', error);
  }
};

const updateEventStatuses = async () => {
  try {
    console.log('📊 Running scheduled job: Update event statuses');

    const now = new Date();

    const completedCount = await Event.update(
      { status: 'completed' },
      {
        where: {
          endDate: {
            [require('sequelize').Op.lt]: now
          },
          status: {
            [require('sequelize').Op.ne]: 'completed'
          }
        }
      }
    );

    console.log(`✓ Marked ${completedCount[0]} events as completed`);
  } catch (error) {
    console.error('✗ Error in updateEventStatuses job:', error);
  }
};

const generateDailyReport = async () => {
  try {
    console.log('📈 Running scheduled job: Generate daily report');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = {
      totalEvents: await Event.count(),
      publishedEvents: await Event.count({ where: { status: 'published' } }),
      draftEvents: await Event.count({ where: { status: 'draft' } }),
      upcomingEvents: await Event.count({
        where: {
          startDate: { [require('sequelize').Op.gte]: today },
          status: 'published'
        }
      }),
      todayEvents: await Event.count({
        where: {
          startDate: {
            [require('sequelize').Op.gte]: today,
            [require('sequelize').Op.lt]: tomorrow
          },
          status: 'published'
        }
      })
    };

    console.log('Daily Report:', stats);

    await mailQueue.add('registration', {
      email: 'admin@example.com',
      name: 'Admin',
      registrationDate: new Date().toISOString()
    });

    console.log('✓ Daily report generated and emailed');
  } catch (error) {
    console.error('✗ Error in generateDailyReport job:', error);
  }
};

const recoverStuckPayments = async () => {
  try {
    console.log('💰 Running scheduled job: Recover stuck payments');

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Find payments stuck in pending status for more than 5 minutes
    const stuckPayments = await Payment.findAll({
      where: {
        status: 'pending',
        createdAt: {
          [Op.lt]: fiveMinutesAgo
        }
      }
    });

    console.log(`Found ${stuckPayments.length} stuck payments`);

    let recovered = 0;
    for (const payment of stuckPayments) {
      try {
        // Re-queue the payment job
        const job = await paymentQueue.add('process-payment', {
          paymentId: payment.id
        }, {
          priority: 1,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });

        // Update job ID
        await payment.update({ jobId: job.id.toString() });

        console.log(`✓ Re-queued stuck payment ${payment.id}`);
        recovered++;
      } catch (error) {
        console.error(`✗ Failed to recover payment ${payment.id}:`, error.message);
      }
    }

    console.log(`✓ Recovered ${recovered}/${stuckPayments.length} stuck payments`);
  } catch (error) {
    console.error('✗ Error in recoverStuckPayments job:', error);
  }
};

const cleanupFailedPayments = async () => {
  try {
    console.log('🧹 Running scheduled job: Cleanup old failed payments');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete failed payments older than 30 days
    const result = await Payment.destroy({
      where: {
        status: 'failed',
        createdAt: {
          [Op.lt]: thirtyDaysAgo
        }
      }
    });

    console.log(`✓ Deleted ${result} old failed payments`);
  } catch (error) {
    console.error('✗ Error in cleanupFailedPayments job:', error);
  }
};

const initializeScheduledJobs = () => {
  console.log('⏰ Initializing scheduled jobs...');

  cron.schedule('0 9 * * *', () => {
    sendEventReminders();
  });
  console.log('✓ Scheduled: Send event reminders daily at 9:00 AM');

  cron.schedule('0 2 * * *', () => {
    cleanupOldEvents();
  });
  console.log('✓ Scheduled: Cleanup old events daily at 2:00 AM');

  cron.schedule('0 3 * * *', () => {
    syncElasticsearchDaily();
  });
  console.log('✓ Scheduled: Full Elasticsearch sync daily at 3:00 AM');

  cron.schedule('*/30 * * * *', () => {
    updateEventStatuses();
  });
  console.log('✓ Scheduled: Update event statuses every 30 minutes');

  cron.schedule('0 8 * * *', () => {
    generateDailyReport();
  });
  console.log('✓ Scheduled: Generate daily report at 8:00 AM');

  cron.schedule('*/5 * * * *', () => {
    recoverStuckPayments();
  });
  console.log('✓ Scheduled: Recover stuck payments every 5 minutes');

  cron.schedule('0 4 * * *', () => {
    cleanupFailedPayments();
  });
  console.log('✓ Scheduled: Cleanup old failed payments daily at 4:00 AM');

  console.log('✓ All scheduled jobs initialized');
};

module.exports = {
  initializeScheduledJobs,
  sendEventReminders,
  cleanupOldEvents,
  syncElasticsearchDaily,
  updateEventStatuses,
  generateDailyReport,
  recoverStuckPayments,
  cleanupFailedPayments
};
