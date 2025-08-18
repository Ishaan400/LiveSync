const swaggerJsDoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LiveSync API',
      version: '1.0.0',
      description: 'API for real-time collaborative document editing',
    },
    servers: [{ url: 'http://localhost' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Document: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string' },
            owner: { type: 'string' },
            participants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  role: { type: 'string', enum: ['editor', 'viewer'] }
                }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            version: { type: 'number' },
          },
        },
        DocumentVersion: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            docId: { type: 'string' },
            userId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            update: { type: 'string', format: 'binary' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

module.exports = swaggerDocs;