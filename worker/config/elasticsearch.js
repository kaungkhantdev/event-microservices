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

const initializeIndex = async () => {
  const indexName = process.env.ELASTICSEARCH_INDEX || 'events';

  try {
    const indexExists = await esClient.indices.exists({ index: indexName });

    if (!indexExists) {
      await esClient.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                event_analyzer: {
                  type: 'standard',
                  stopwords: '_english_'
                }
              }
            }
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'event_analyzer',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              description: {
                type: 'text',
                analyzer: 'event_analyzer'
              },
              location: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              startDate: { type: 'date' },
              endDate: { type: 'date' },
              category: { type: 'keyword' },
              organizer: { type: 'keyword' },
              maxAttendees: { type: 'integer' },
              status: { type: 'keyword' },
              metadata: { type: 'object', enabled: true },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' }
            }
          }
        }
      });
      console.log(`✓ Elasticsearch index '${indexName}' created`);
    } else {
      console.log(`✓ Elasticsearch index '${indexName}' already exists`);
    }
  } catch (error) {
    console.error('✗ Error initializing Elasticsearch index:', error);
    throw error;
  }
};

const checkConnection = async () => {
  try {
    const health = await esClient.cluster.health();
    console.log('✓ Elasticsearch connected:', health.cluster_name);
    return true;
  } catch (error) {
    console.error('✗ Elasticsearch connection failed:', error.message);
    return false;
  }
};

module.exports = {
  esClient,
  initializeIndex,
  checkConnection,
};
