/**
 * Agent API routes
 */
import { Router } from 'express';

/**
 * Create agent routes
 * @param {import('../src/services/AgentService.js').AgentService} agentService
 * @returns {Router}
 */
export function agentRoutes(agentService) {
  const router = Router();

  /**
   * POST /api/agent/message
   * Send a message to the agent
   */
  router.post('/message', async (req, res) => {
    try {
      const { message, sessionId = 'api:default' } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }

      const response = await agentService.processDirect(message, sessionId);
      res.json({ response, sessionId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/agent/sessions
   * List all sessions
   */
  router.get('/sessions', async (req, res) => {
    try {
      const sessions = agentService.listSessions();
      res.json({ sessions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/agent/sessions/:key
   * Delete a session
   */
  router.delete('/sessions/:key', async (req, res) => {
    try {
      const deleted = agentService.deleteSession(req.params.key);
      res.json({ deleted });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
