/**
 * Admin routes
 */
import { Router } from 'express';

/**
 * Create admin routes
 * @param {object} services - All services
 * @returns {Router}
 */
export function adminRoutes(services) {
  const router = Router();
  const { agentService, channelService, cronService, config } = services;

  /**
   * GET /admin
   * Admin dashboard
   */
  router.get('/', (req, res) => {
    res.render('admin', {
      title: 'Superbot Admin',
      channels: channelService.getStatus(),
      sessions: agentService.listSessions(),
      cron: cronService.listJobs()
    });
  });

  /**
   * GET /admin/sessions
   * Session management
   */
  router.get('/sessions', (req, res) => {
    const sessions = agentService.listSessions();
    res.json({ sessions });
  });

  /**
   * GET /admin/cron
   * Cron job management
   */
  router.get('/cron', (req, res) => {
    const jobs = cronService.listJobs();
    res.json({ jobs });
  });

  return router;
}
