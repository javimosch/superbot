/**
 * Route setup for Express server
 */
import { agentRoutes } from './agent.js';
import { adminRoutes } from './admin.js';
import { channelRoutes } from './channels.js';

/**
 * Setup all routes
 * @param {import('express').Application} app - Express app
 * @param {object} services - Service instances
 */
export function setupRoutes(app, services) {
  const { agentService, channelService, cronService, config } = services;

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/agent', agentRoutes(agentService));
  app.use('/api/channels', channelRoutes(channelService));

  // Admin routes (with basic auth)
  app.use('/admin', basicAuth(config), adminRoutes(services));

  // Landing page
  app.get('/', (req, res) => {
    res.render('index', { title: 'Superbot' });
  });
}

/**
 * Basic auth middleware
 * @param {object} config - Configuration
 * @returns {import('express').RequestHandler}
 */
function basicAuth(config) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
      return res.status(401).send('Authentication required');
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [user, pass] = credentials.split(':');

    if (user === config.admin.user && pass === config.admin.pass) {
      return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Invalid credentials');
  };
}
