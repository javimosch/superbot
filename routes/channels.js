/**
 * Channel management routes
 */
import { Router } from 'express';

/**
 * Create channel routes
 * @param {import('../src/services/ChannelService.js').ChannelService} channelService
 * @returns {Router}
 */
export function channelRoutes(channelService) {
  const router = Router();

  /**
   * GET /api/channels/status
   * Get status of all channels
   */
  router.get('/status', (req, res) => {
    const status = channelService.getStatus();
    res.json(status);
  });

  return router;
}
