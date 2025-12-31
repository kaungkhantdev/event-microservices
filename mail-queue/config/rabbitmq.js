require('dotenv').config();
const amqp = require('amqplib');

class RabbitMQWorker {
  constructor(queueName, bindings = []) {
    this.connection = null;
    this.channel = null;
    this.QUEUE = queueName;
    this.EXCHANGE = 'events.topic';
    this.bindings = bindings;
    this.reconnectDelay = 5000;
    this.messageHandlers = new Map();
  }

  async start() {
    try {
      this.connection = await amqp.connect({
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: process.env.RABBITMQ_PORT || 5672,
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASS || 'guest',
        heartbeat: 60,
      });

      this.channel = await this.connection.createChannel();

      await this.channel.prefetch(5);

      await this.channel.assertExchange(this.EXCHANGE, 'topic', {
        durable: true,
      });

      await this.channel.assertQueue(this.QUEUE, {
        durable: true,
        maxPriority: 10,
        deadLetterExchange: 'events.dlx',
        deadLetterRoutingKey: `${this.QUEUE}.failed`,
        messageTtl: 86400000,
      });

      for (const routingKey of this.bindings) {
        await this.channel.bindQueue(this.QUEUE, this.EXCHANGE, routingKey);
      }

      console.log(`✅ Worker listening on queue: ${this.QUEUE}`);
      console.log(`✅ Bound to routing keys:`, this.bindings);

      await this.channel.consume(this.QUEUE, this.handleMessage.bind(this), {
        noAck: false,
      });

      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('⚠️  RabbitMQ connection closed, reconnecting...');
        setTimeout(() => this.start(), this.reconnectDelay);
      });

    } catch (error) {
      console.error('❌ Worker failed to start:', error.message);
      setTimeout(() => this.start(), this.reconnectDelay);
    }
  }

  async handleMessage(msg) {
    if (!msg) return;

    const routingKey = msg.fields.routingKey;
    const content = JSON.parse(msg.content.toString());

    console.log(`📨 Processing: ${routingKey}`, content);

    try {
      const handler = this.messageHandlers.get(routingKey);

      if (handler) {
        await handler(content);
      } else {
        console.warn(`⚠️  No handler for routing key: ${routingKey}`);
      }

      this.channel.ack(msg);
      console.log(`✅ Processed: ${routingKey}`);

    } catch (error) {
      console.error(`❌ Error processing ${routingKey}:`, error);

      const retryCount = msg.properties.headers?.['x-retry-count'] || 0;

      if (retryCount < 3) {
        setTimeout(() => {
          this.channel.nack(msg, false, true);
        }, Math.pow(2, retryCount) * 1000);

      } else {
        this.channel.nack(msg, false, false);
        console.error(`❌ Max retries reached for ${routingKey}, sent to DLQ`);
      }
    }
  }

  registerHandler(routingKey, handler) {
    this.messageHandlers.set(routingKey, handler);
  }

  async close() {
    await this.channel?.close();
    await this.connection?.close();
  }
}

module.exports = RabbitMQWorker;
