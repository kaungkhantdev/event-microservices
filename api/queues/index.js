require('dotenv').config();
const rabbitmq = require('../config/rabbitmq');

const publishToElasticSync = async (routingKey, data, options = {}) => {
  return await rabbitmq.publish(routingKey, data, options);
};

const publishToMail = async (routingKey, data, options = {}) => {
  return await rabbitmq.publish(routingKey, data, options);
};

const publishToPayment = async (routingKey, data, options = {}) => {
  return await rabbitmq.publish(routingKey, data, options);
};

module.exports = {
  publishToElasticSync,
  publishToMail,
  publishToPayment,
  rabbitmq
};
