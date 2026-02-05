#!/usr/bin/env node
/**
 * Superbot Express Server
 * Main entry point for the HTTP API
 */
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { getConfig } from './config/index.js';
import logger from './src/utils/logger.js';
import { setupRoutes } from './routes/index.js';
import { AgentService } from './src/services/AgentService.js';
import { ChannelService } from './src/services/ChannelService.js';
import { CronService } from './src/services/CronService.js';
import { HeartbeatService } from './src/services/HeartbeatService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const config = getConfig();
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(join(__dirname, 'public')));

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', join(__dirname, 'views'));

  // Initialize services
  const agentService = new AgentService(config);
  const channelService = new ChannelService(config, agentService);
  const cronService = new CronService(config, agentService);
  const heartbeatService = new HeartbeatService(config, agentService);

  // Setup routes
  setupRoutes(app, { agentService, channelService, cronService, config });

  // Start server
  const port = config.port;
  const server = app.listen(port, () => {
    logger.info(`🤖 Superbot server running on http://localhost:${port}`);
  });

  // Start background services
  await channelService.startAll();
  await agentService.startLoop();  // Start the agent loop to process messages
  await cronService.start();
  await heartbeatService.start();

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) {
      logger.info('Shutdown already in progress, forcing exit...');
      process.exit(1);
    }
    isShuttingDown = true;
    
    logger.info('Shutting down...');
    
    try {
      heartbeatService.stop();
      cronService.stop();
      agentService.stopLoop();  // Stop the agent loop
      await channelService.stopAll();
      
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
      
      // Force exit after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 5000);
    } catch (err) {
      logger.error(`Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
