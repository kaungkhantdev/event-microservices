require('dotenv').config();
const { Client } = require('@elastic/elasticsearch');

const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
    ? {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
      }
    : undefined,
});

const checkConnection = async () => {
  try {
    const health = await esClient.cluster.health();
    console.log('✓ Elasticsearch connected:', health.cluster_name);
    return true;
  } catch (error) {
    console.warn('⚠ Elasticsearch not available:', error.message);
    return false;
  }
};

module.exports = {
  esClient,
  checkConnection,
  INDEX_NAME: process.env.ELASTICSEARCH_INDEX || 'events'
};
