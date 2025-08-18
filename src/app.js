// At the very top, before any other imports:
const crypto = require('crypto');
global.crypto = { getRandomValues: arr => crypto.randomFillSync(arr) };

const express = require('express');
const rateLimit = require('express-rate-limit');
const passport = require('./middlewares/passport');
const requestLogger = require('./middlewares/requestLogger');

const app = express();

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json());
app.use(requestLogger);
app.use(passport.initialize());

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LiveSync API',
      version: '1.0.0',
      description: 'Auto-generated Swagger docs for LiveSync API',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js', './src/app.js'],
};


const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));



/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 uptime:
 *                   type: number
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/documents', require('./routes/document'));
app.use('/users', require('./routes/user'));
app.use('/activity', require('./routes/activity'));

module.exports = app;
