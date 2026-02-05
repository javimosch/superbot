/**
 * Heartbeat Service - periodic agent wake-up to check for tasks
 */
import logger from '../utils/logger.js';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { getWorkspacePath } from '../utils/helpers.js';

const HEARTBEAT_PROMPT = `Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK`;

const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

export class HeartbeatService {
  /**
   * @param {object} config - Configuration object
   * @param {import('./AgentService.js').AgentService} agentService - Agent service
   */
  constructor(config, agentService) {
    this.config = config;
    this.agentService = agentService;
    this.workspacePath = getWorkspacePath(config.workspacePath);
    this.heartbeatFile = join(this.workspacePath, 'HEARTBEAT.md');
    this._intervalId = null;
    this._running = false;
  }

  /**
   * Start the heartbeat service
   */
  async start() {
    if (!this.config.heartbeat.enabled) {
      logger.info('HeartbeatService disabled');
      return;
    }

    this._running = true;
    const intervalMs = this.config.heartbeat.intervalS * 1000;
    this._intervalId = setInterval(() => this._tick(), intervalMs);
    logger.info(`HeartbeatService started (every ${this.config.heartbeat.intervalS}s)`);
  }

  /**
   * Stop the heartbeat service
   */
  stop() {
    this._running = false;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    logger.info('HeartbeatService stopped');
  }

  /**
   * Execute a single heartbeat tick
   */
  async _tick() {
    if (!this._running) return;

    const content = this._readHeartbeatFile();
    if (this._isEmpty(content)) {
      logger.debug('Heartbeat: no tasks (HEARTBEAT.md empty or missing)');
      return;
    }

    logger.info('Heartbeat: checking for tasks...');
    try {
      const response = await this.agentService.processDirect(HEARTBEAT_PROMPT, 'heartbeat:system');
      
      // Check if agent said "nothing to do"
      if (response.toUpperCase().replace(/_/g, '').includes(HEARTBEAT_OK_TOKEN.replace(/_/g, ''))) {
        logger.info('Heartbeat: OK (no action needed)');
      } else {
        logger.info('Heartbeat: completed task');
      }
    } catch (err) {
      logger.error(`Heartbeat error: ${err.message}`);
    }
  }

  /**
   * Manually trigger a heartbeat
   * @returns {Promise<string|null>}
   */
  async triggerNow() {
    if (!this.agentService) return null;
    return await this.agentService.processDirect(HEARTBEAT_PROMPT, 'heartbeat:manual');
  }

  _readHeartbeatFile() {
    if (!existsSync(this.heartbeatFile)) return null;
    try {
      return readFileSync(this.heartbeatFile, 'utf-8');
    } catch {
      return null;
    }
  }

  _isEmpty(content) {
    if (!content) return true;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--')) continue;
      if (trimmed === '- [ ]' || trimmed === '* [ ]' || trimmed === '- [x]' || trimmed === '* [x]') continue;
      return false;
    }
    return true;
  }
}
