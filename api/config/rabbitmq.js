require('dotenv').config();
const amqp = require('amqplib');

class RabbitMQPublisher {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.EXCHANGE = 'events.topic';
    this.reconnectDelay = 5000;
  }

  async connect() {
    try {
      this.connection = await amqp.connect({
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: process.env.RABBITMQ_PORT || 5672,
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASS || 'guest',
        heartbeat: 60,
      });

      this.channel = await this.connection.createConfirmChannel();

      await this.channel.assertExchange(this.EXCHANGE, 'topic', {
        durable: true,
      });

      await this.channel.assertExchange('events.dlx', 'topic', {
        durable: true,
      });

      console.log('✅ Connected to RabbitMQ');

      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('⚠️  RabbitMQ connection closed, reconnecting...');
        setTimeout(() => this.connect(), this.reconnectDelay);
      });

    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error.message);
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }

  async publish(routingKey, message, options = {}) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const msgBuffer = Buffer.from(JSON.stringify({
      ...message,
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
    }));

    try {
      return new Promise((resolve, reject) => {
        this.channel.publish(
          this.EXCHANGE,
          routingKey,
          msgBuffer,
          {
            persistent: true,
            contentType: 'application/json',
            priority: options.priority || 5,
            timestamp: Date.now(),
            ...options,
          },
          (err) => {
            if (err) {
              console.error(`❌ Failed to publish ${routingKey}:`, err);
              reject(err);
            } else {
              console.log(`✅ Published: ${routingKey}`);
              resolve(true);
            }
          }
        );
      });
    } catch (error) {
      console.error(`❌ Failed to publish ${routingKey}:`, error);
      throw error;
    }
  }

  generateMessageId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async close() {
    await this.channel?.close();
    await this.connection?.close();
  }
}

module.exports = new RabbitMQPublisher();
