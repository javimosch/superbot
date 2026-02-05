/**
 * Agent Service - orchestrates the agent loop and related components
 */
import logger from '../utils/logger.js';
import { getWorkspacePath } from '../utils/helpers.js';
import { getMessageBus } from '../bus/MessageBus.js';
import { createProvider } from '../providers/openai.js';
import { AgentLoop } from '../agent/AgentLoop.js';
import { SessionManager } from '../session/SessionManager.js';

export class AgentService {
  /**
   * @param {object} config - Configuration object
   */
  constructor(config) {
    this.config = config;
    this.workspacePath = getWorkspacePath(config.workspacePath);
    this.bus = getMessageBus();
    this.sessionManager = new SessionManager(this.workspacePath);

    // Create provider
    this.provider = createProvider(config);

    // Create agent loop
    this.agentLoop = new AgentLoop({
      bus: this.bus,
      provider: this.provider,
      workspacePath: this.workspacePath,
      sessionManager: this.sessionManager,
      model: config.provider.defaultModel,
      maxIterations: config.agent.maxIterations,
      braveApiKey: config.web.braveApiKey,
      execConfig: config.exec
    });

    logger.info(`AgentService initialized with workspace: ${this.workspacePath}`);
  }

  /**
   * Process a direct message (for CLI/API usage)
   * @param {string} content - Message content
   * @param {string} sessionKey - Session identifier
   * @returns {Promise<string>}
   */
  async processDirect(content, sessionKey = 'cli:direct') {
    logger.info(`Processing message for session ${sessionKey}`);
    return await this.agentLoop.processDirect(content, sessionKey);
  }

  /**
   * Get the message bus for channel integration
   * @returns {object}
   */
  getMessageBus() {
    return this.bus;
  }

  /**
   * Start the agent loop (for gateway mode)
   */
  async startLoop() {
    await this.agentLoop.run();
  }

  /**
   * Stop the agent loop
   */
  stopLoop() {
    this.agentLoop.stop();
  }

  /**
   * List all sessions
   * @returns {Array}
   */
  listSessions() {
    return this.sessionManager.listSessions();
  }

  /**
   * Delete a session
   * @param {string} key - Session key
   * @returns {boolean}
   */
  deleteSession(key) {
    return this.sessionManager.delete(key);
  }
}
